import type { ActionItem, Suggestion, SuggestionKind, SuggestionStatus } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { NotFoundError, rid, ridOrNull } from '../db/records.js';

export interface SuggestionDraft {
  kind: SuggestionKind;
  title: string;
  reason: string;
  proposal?: string | null;
  quote?: string | null;
  cite?: string | null;
  sourceMessageId?: string | null;
  items?: ActionItem[];
  taskId?: string | null;
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

export async function createSuggestion(projectId: string, draft: SuggestionDraft): Promise<Suggestion> {
  const suggestion = await queryOne<Suggestion>('CREATE ONLY suggestion CONTENT $content', {
    content: {
      projectId: rid('project', projectId),
      kind: draft.kind,
      status: 'pending',
      title: draft.title,
      reason: draft.reason,
      proposal: draft.proposal ?? null,
      quote: draft.quote ?? null,
      cite: draft.cite ?? null,
      sourceMessageId: ridOrNull('message', draft.sourceMessageId),
      items: toDbItems(draft.items ?? []),
      taskId: ridOrNull('task', draft.taskId),
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
