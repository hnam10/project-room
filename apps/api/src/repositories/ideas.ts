import type { Idea, IdeaCreateInput } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { NotFoundError, rid } from '../db/records.js';

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

export async function createIdea(projectId: string, authorId: string, input: Required<IdeaCreateInput>): Promise<Idea> {
  const idea = await queryOne<Idea>('CREATE ONLY idea CONTENT $content', {
    content: { ...input, projectId: rid('project', projectId), authorId: rid('member', authorId) },
  });
  if (!idea) throw new Error('Idea creation returned nothing');
  return idea;
}

/** Adds the member's vote, or removes it if they already voted. */
export async function toggleVote(projectId: string, ideaId: string, memberId: string): Promise<Idea> {
  const idea = await getIdea(projectId, ideaId);
  const member = rid('member', memberId);
  const op = idea.voterIds.includes(memberId) ? '-=' : '+=';
  const updated = await queryOne<Idea>(`UPDATE ONLY $id SET voterIds ${op} $member RETURN AFTER`, { id: rid('idea', ideaId), member });
  if (!updated) throw new NotFoundError('Idea');
  return updated;
}

export async function linkIdeaToTask(ideaId: string, taskId: string): Promise<Idea> {
  const idea = await queryOne<Idea>('UPDATE ONLY $id SET taskId = $task RETURN AFTER', { id: rid('idea', ideaId), task: rid('task', taskId) });
  if (!idea) throw new NotFoundError('Idea');
  return idea;
}
