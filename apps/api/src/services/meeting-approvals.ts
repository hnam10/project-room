import type { Suggestion } from '@project-room/shared';
import { ConflictError } from '../db/records.js';
import { createIdea, updateIdeaDescription } from '../repositories/ideas.js';
import { createPoll } from '../repositories/polls.js';
import { resolveSuggestion } from '../repositories/suggestions.js';

// Approval paths for suggestions that come from meetings (and idea/poll suggestions in general).

export async function approveIdea(projectId: string, suggestion: Suggestion, memberId: string): Promise<Suggestion> {
  const draft = suggestion.ideaDraft;
  if (!draft) throw new ConflictError('Suggestion has no idea to add');
  if (suggestion.ideaId) await updateIdeaDescription(projectId, suggestion.ideaId, draft.description);
  else await createIdea(projectId, memberId, draft);
  return resolveSuggestion(suggestion.id, 'approved', memberId);
}

export async function approvePoll(projectId: string, suggestion: Suggestion, memberId: string): Promise<Suggestion> {
  if (!suggestion.pollDraft) throw new ConflictError('Suggestion has no poll to open');
  await createPoll(projectId, memberId, suggestion.pollDraft, { meetingId: suggestion.meetingId, sourceSuggestionId: suggestion.id });
  return resolveSuggestion(suggestion.id, 'approved', memberId);
}
