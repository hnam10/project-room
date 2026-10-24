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

export interface SuggestionDraft {
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

/** Pending proposals based on a deleted idea can no longer be approved. */
export function dismissPendingSuggestionsForIdea(projectId: string, ideaId: string, memberId: string): Promise<Suggestion[]> {
  return queryMany<Suggestion>(
    "UPDATE suggestion SET status = 'dismissed', resolvedById = $member WHERE projectId = $project AND (ideaId = $idea OR originIdeaId = $idea) AND status = 'pending' RETURN AFTER",
    { project: rid('project', projectId), idea: rid('idea', ideaId), member: rid('member', memberId) },
  );
}

/** With a fixed `id`, a retry returns the suggestion already stored under it instead of creating a second one. */
export async function createSuggestion(projectId: string, draft: SuggestionDraft, id?: string): Promise<Suggestion> {
  const target = id ? rid('suggestion', id) : null;
  if (target) {
    const existing = await queryOne<Suggestion>('SELECT * FROM ONLY $id', { id: target });
    if (existing) return existing;
  }
  const suggestion = await queryOne<Suggestion>(`CREATE ONLY ${target ? '$id' : 'suggestion'} CONTENT $content`, {
    id: target,
    content: {
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
  });
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
