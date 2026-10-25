import type { Idea, IdeaCreateInput, IdeaUpdateInput, ResearchSource } from '@project-room/shared';
import { ideaCreateSchema } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { ConflictError, NotFoundError, rid } from '../db/records.js';
import { getTopic, resetTopic } from './brainstorm-topics.js';

export function listIdeas(projectId: string): Promise<Idea[]> {
  return queryMany<Idea>('SELECT * FROM idea WHERE projectId = $project ORDER BY createdAt', { project: rid('project', projectId) });
}

export async function getIdea(projectId: string, ideaId: string): Promise<Idea> {
  const idea = await queryOne<Idea>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('idea', ideaId),
    project: rid('project', projectId),
  });
  if (!idea) throw new NotFoundError('Idea');
  return idea;
}

export async function deleteIdea(projectId: string, ideaId: string): Promise<void> {
  await getIdea(projectId, ideaId);
  await queryOne('DELETE ONLY $id', { id: rid('idea', ideaId) });
}

export async function createIdea(
  projectId: string,
  authorId: string,
  input: Pick<Idea, 'title' | 'description' | 'theme'> & Pick<IdeaCreateInput, 'kind' | 'topicId'>,
  source: { suggestionId: string; researchSources: ResearchSource[] } | null = null,
): Promise<Idea> {
  const topic = input.kind === 'problem' ? null : await getTopic(projectId, input.topicId);
  const create = 'CREATE ONLY idea CONTENT $content';
  const idea = await queryOne<Idea>(
    topic
      ? `
    IF array::len((SELECT VALUE id FROM idea WHERE id = $topic AND projectId = $project AND boardVersion = $version)) = 1
      AND ($source = null OR array::len((SELECT VALUE id FROM suggestion WHERE id = $source AND projectId = $project AND status = 'pending')) = 1) {
      ${create}
    } ELSE { THROW 'The brainstorm topic changed'; }`
      : create,
    {
      topic: topic ? rid('idea', topic.id) : null,
      project: rid('project', projectId),
      version: topic?.boardVersion,
      source: source ? rid('suggestion', source.suggestionId) : null,
      content: {
        ...input,
        kind: input.kind ?? 'idea',
        topicId: topic ? rid('idea', topic.id) : null,
        projectId: rid('project', projectId),
        authorId: rid('member', authorId),
        votingOpen: false,
        sourceSuggestionId: source ? rid('suggestion', source.suggestionId) : null,
        researchSources: source?.researchSources ?? [],
      },
    },
  );
  if (!idea) throw new Error('Idea creation returned nothing');
  return idea;
}

/** Toggles a member's heart without starting a formal vote or approving the idea. */
export async function toggleVote(projectId: string, ideaId: string, memberId: string): Promise<Idea> {
  const idea = await getIdea(projectId, ideaId);
  if (idea.kind === 'problem') throw new ConflictError('Only ideas can receive hearts');
  const member = rid('member', memberId);
  const op = idea.voterIds.includes(memberId) ? '-=' : '+=';
  const updated = await queryOne<Idea>(`UPDATE ONLY $id SET voterIds ${op} $member RETURN AFTER`, { id: rid('idea', ideaId), member });
  if (!updated) throw new NotFoundError('Idea');
  return updated;
}

export async function startIdeaVote(projectId: string, ideaId: string): Promise<Idea> {
  const idea = await getIdea(projectId, ideaId);
  if (idea.votingOpen) throw new ConflictError('Voting is already open for this idea');
  const updated = await queryOne<Idea>('UPDATE ONLY $id SET votingOpen = true RETURN AFTER', { id: rid('idea', ideaId) });
  if (!updated) throw new NotFoundError('Idea');
  return updated;
}

export async function linkIdeaToTask(ideaId: string, taskId: string): Promise<Idea> {
  const idea = await queryOne<Idea>('UPDATE ONLY $id SET taskId = $task RETURN AFTER', {
    id: rid('idea', ideaId),
    task: rid('task', taskId),
  });
  if (!idea) throw new NotFoundError('Idea');
  return idea;
}

export async function updateIdeaDescription(projectId: string, ideaId: string, description: string): Promise<Idea> {
  await getIdea(projectId, ideaId);
  const idea = await queryOne<Idea>('UPDATE ONLY $id SET description = $description RETURN AFTER', {
    id: rid('idea', ideaId),
    description,
  });
  if (!idea) throw new NotFoundError('Idea');
  return idea;
}

/** Validates the resulting idea against its stored kind and theme before changing it or clearing a topic board. */
export async function updateIdea(projectId: string, ideaId: string, patch: IdeaUpdateInput, significant: boolean): Promise<Idea> {
  const previous = await getIdea(projectId, ideaId);
  ideaCreateSchema.parse({ ...previous, ...patch });
  if (previous.kind === 'problem') {
    const changed =
      (patch.title !== undefined && patch.title !== previous.title) ||
      (patch.description !== undefined && patch.description !== previous.description);
    return changed ? (await resetTopic(projectId, ideaId, 'all', patch))! : previous;
  }
  const changes = significant ? ', significantChangeAt = time::now(), researchStale = $stale, approved = false' : '';
  const idea = await queryOne<Idea>(
    `UPDATE ONLY $id SET title = $title, description = $description, theme = $theme${changes} RETURN AFTER`,
    {
      id: rid('idea', ideaId),
      title: patch.title ?? previous.title,
      description: patch.description ?? previous.description,
      theme: patch.theme ?? previous.theme,
      stale: (previous.researchSources ?? []).length > 0,
    },
  );
  if (!idea) throw new NotFoundError('Idea');
  return idea;
}

export async function setIdeaShortlisted(projectId: string, ideaId: string, shortlisted: boolean): Promise<Idea> {
  const previous = await getIdea(projectId, ideaId);
  if (previous.kind === 'problem') throw new ConflictError('The central problem cannot be shortlisted');
  if (previous.approved) throw new ConflictError('An approved idea cannot be changed to a shortlist');
  const idea = await queryOne<Idea>('UPDATE ONLY $id SET shortlisted = $shortlisted RETURN AFTER', {
    id: rid('idea', ideaId),
    shortlisted,
  });
  if (!idea) throw new NotFoundError('Idea');
  return idea;
}

/** Approves a saved idea directly after the member confirms; no shortlist stage is required. */
export async function approveSelectedIdea(projectId: string, ideaId: string): Promise<Idea> {
  const previous = await getIdea(projectId, ideaId);
  if (previous.kind === 'problem') throw new ConflictError('A topic cannot be approved as an idea');
  if (previous.approved) throw new ConflictError('This idea is already approved');
  const idea = await queryOne<Idea>('UPDATE ONLY $id SET approved = true RETURN AFTER', { id: rid('idea', ideaId) });
  if (!idea) throw new NotFoundError('Idea');
  return idea;
}

export async function attachIdeaResearch(projectId: string, ideaId: string, sources: ResearchSource[]): Promise<Idea> {
  const previous = await getIdea(projectId, ideaId);
  const merged = [...previous.researchSources, ...sources].filter(
    (source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index,
  );
  const idea = await queryOne<Idea>('UPDATE ONLY $id SET researchSources = $sources, researchStale = false RETURN AFTER', {
    id: rid('idea', ideaId),
    sources: merged,
  });
  if (!idea) throw new NotFoundError('Idea');
  return idea;
}
