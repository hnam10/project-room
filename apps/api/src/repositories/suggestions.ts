import type {
  ActionItem,
  BrainstormTrigger,
  IdeaDraft,
  PollDraft,
  ResearchSource,
  Suggestion,
  SuggestionKind,
  SuggestionStatus,
} from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { NotFoundError, rid, ridOrNull } from '../db/records.js';
import { assertTopicScope, brainstormScope, getTopic } from './brainstorm-topics.js';

export interface SuggestionDraft {
  topicId?: string | null;
  topicVersion?: number | null;
  kind: SuggestionKind;
  /** Used for a hidden, completed research check when search found nothing worth showing. */
  status?: SuggestionStatus;
  title: string;
  reason: string;
  proposal?: string | null;
  outcome?: string | null;
  quote?: string | null;
  cite?: string | null;
  researchSources?: ResearchSource[];
  sourceMessageId?: string | null;
  items?: ActionItem[];
  taskId?: string | null;
  meetingId?: string | null;
  sourceLineId?: string | null;
  ideaId?: string | null;
  originIdeaId?: string | null;
  brainstormTrigger?: BrainstormTrigger | null;
  ideaDraft?: IdeaDraft | null;
  pollDraft?: PollDraft | null;
}

const toDbItems = (items: ActionItem[]) => items.map((i) => ({ ...i, assigneeId: ridOrNull('member', i.assigneeId) }));

export function listSuggestions(projectId: string): Promise<Suggestion[]> {
  return queryMany<Suggestion>('SELECT * FROM suggestion WHERE projectId = $project ORDER BY createdAt DESC', {
    project: rid('project', projectId),
  });
}

export async function getSuggestion(projectId: string, suggestionId: string): Promise<Suggestion> {
  const suggestion = await queryOne<Suggestion>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('suggestion', suggestionId),
    project: rid('project', projectId),
  });
  if (!suggestion) throw new NotFoundError('Suggestion');
  return suggestion;
}

/** A member chooses where an inbox draft belongs before it can create a board card. */
export async function assignSuggestionTopic(projectId: string, suggestionId: string, topicId: string): Promise<void> {
  const topic = await getTopic(projectId, topicId);
  await queryOne("UPDATE ONLY $id SET topicId = $topic, topicVersion = $version WHERE projectId = $project AND status = 'pending'", {
    id: rid('suggestion', suggestionId),
    project: rid('project', projectId),
    topic: rid('idea', topic.id),
    version: topic.boardVersion,
  });
}

/** Pending proposals based on a deleted idea can no longer be approved. */
export function dismissPendingSuggestionsForIdea(projectId: string, ideaId: string, memberId: string): Promise<Suggestion[]> {
  return queryMany<Suggestion>(
    "UPDATE suggestion SET status = 'dismissed', resolvedById = $member WHERE projectId = $project AND (ideaId = $idea OR originIdeaId = $idea) AND status = 'pending' RETURN AFTER",
    { project: rid('project', projectId), idea: rid('idea', ideaId), member: rid('member', memberId) },
  );
}

/** With a fixed `id`, a retry returns the suggestion already stored under it instead of creating a second one. */
export async function createSuggestion(projectId: string, draft: SuggestionDraft, id?: string): Promise<Suggestion> {
  const scope = brainstormScope.getStore();
  if (scope) await assertTopicScope(scope);
  // Develop/research proposals inherit the referenced card's topic. New chat and
  // meeting proposals can remain in the inbox until a member chooses a topic.
  const reference = draft.ideaId ?? draft.originIdeaId;
  const parent = reference
    ? await queryOne<{ id: string; kind: string; topicId: string | null; boardVersion: number }>(
        'SELECT id, kind, topicId, boardVersion FROM ONLY $id WHERE projectId = $project',
        { id: rid('idea', reference), project: rid('project', projectId) },
      )
    : null;
  const topicId = scope?.topicId ?? draft.topicId ?? (parent?.kind === 'problem' ? parent.id : parent?.topicId) ?? null;
  const target = id ? rid('suggestion', id) : null;
  if (target) {
    const existing = await queryOne<Suggestion>('SELECT * FROM ONLY $id', { id: target });
    if (existing) return existing;
  }
  // Explicit meeting scopes need the same atomic version guard as board AI scopes.
  const topic = topicId ? await getTopic(projectId, topicId) : null;
  const topicVersion = scope?.version ?? draft.topicVersion ?? topic?.boardVersion ?? null;
  const create = `CREATE ONLY ${target ? '$id' : 'suggestion'} CONTENT $content`;
  const suggestion = await queryOne<Suggestion>(
    topic
      ? `
    IF array::len((SELECT VALUE id FROM idea WHERE id = $topic AND projectId = $project AND kind = 'problem' AND boardVersion = $version)) = 1 {
      ${create}
    } ELSE { THROW 'The brainstorm topic changed'; }`
      : create,
    {
      id: target,
      topic: ridOrNull('idea', topicId),
      project: rid('project', projectId),
      version: topicVersion,
      content: {
        topicId: ridOrNull('idea', topicId),
        topicVersion,
        projectId: rid('project', projectId),
        kind: draft.kind,
        status: draft.status ?? 'pending',
        title: draft.title,
        reason: draft.reason,
        proposal: draft.proposal ?? null,
        outcome: draft.outcome ?? null,
        quote: draft.quote ?? null,
        cite: draft.cite ?? null,
        researchSources: draft.researchSources ?? [],
        sourceMessageId: ridOrNull('message', draft.sourceMessageId),
        items: toDbItems(draft.items ?? []),
        taskId: ridOrNull('task', draft.taskId),
        meetingId: ridOrNull('meeting', draft.meetingId),
        sourceLineId: ridOrNull('transcript_line', draft.sourceLineId),
        ideaId: ridOrNull('idea', draft.ideaId),
        originIdeaId: ridOrNull('idea', draft.originIdeaId),
        brainstormTrigger: draft.brainstormTrigger ?? null,
        ideaDraft: draft.ideaDraft ?? null,
        pollDraft: draft.pollDraft ?? null,
      },
    },
  );
  if (!suggestion) throw new Error('Suggestion creation returned nothing');
  return suggestion;
}

export async function updateSuggestionItems(suggestionId: string, items: ActionItem[]): Promise<Suggestion> {
  const suggestion = await queryOne<Suggestion>('UPDATE ONLY $id SET items = $items RETURN AFTER', {
    id: rid('suggestion', suggestionId),
    items: toDbItems(items),
  });
  if (!suggestion) throw new NotFoundError('Suggestion');
  return suggestion;
}

export async function updateSuggestionDrafts(
  suggestionId: string,
  patch: { ideaDraft?: IdeaDraft; pollDraft?: PollDraft },
): Promise<Suggestion> {
  const suggestion = await queryOne<Suggestion>('UPDATE ONLY $id MERGE $patch RETURN AFTER', {
    id: rid('suggestion', suggestionId),
    // Only defined keys: a MERGE with an undefined key could unset the other draft.
    patch: Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  });
  if (!suggestion) throw new NotFoundError('Suggestion');
  return suggestion;
}

export async function updateSuggestionResearchSummary(
  projectId: string,
  suggestionId: string,
  proposal: string,
  reason: string,
): Promise<Suggestion> {
  const suggestion = await queryOne<Suggestion>(
    "UPDATE ONLY $id SET proposal = $proposal, reason = $reason WHERE projectId = $project AND status = 'pending' RETURN AFTER",
    { id: rid('suggestion', suggestionId), project: rid('project', projectId), proposal, reason },
  );
  if (!suggestion) throw new NotFoundError('Pending research suggestion');
  return suggestion;
}

export async function resolveSuggestion(
  suggestionId: string,
  status: Exclude<SuggestionStatus, 'pending'>,
  memberId: string,
  createdTaskIds: string[] = [],
): Promise<Suggestion> {
  const suggestion = await queryOne<Suggestion>(
    'UPDATE ONLY $id SET status = $status, resolvedById = $member, createdTaskIds = $tasks RETURN AFTER',
    {
      id: rid('suggestion', suggestionId),
      status,
      member: rid('member', memberId),
      tasks: createdTaskIds.map((id) => rid('task', id)),
    },
  );
  if (!suggestion) throw new NotFoundError('Suggestion');
  return suggestion;
}
