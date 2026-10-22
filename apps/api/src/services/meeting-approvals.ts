import type { Suggestion } from '@project-room/shared';
import { ConflictError } from '../db/records.js';
import { createIdea, updateIdeaDescription } from '../repositories/ideas.js';
import { getMeeting, setCarryOver } from '../repositories/meetings.js';
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

/** The notes the member kept become the next meeting's carry-over. */
export async function approveMeetingNotes(projectId: string, suggestion: Suggestion, memberId: string): Promise<Suggestion> {
  if (!suggestion.meetingId) throw new ConflictError('Suggestion has no meeting');
  const meeting = await getMeeting(projectId, suggestion.meetingId);
  const notes = suggestion.items.filter((i) => i.include && i.title.trim()).map((i) => i.title.trim());
  if (!notes.length) throw new ConflictError('No notes are selected');
  await setCarryOver(meeting.id, notes);
  return resolveSuggestion(suggestion.id, 'approved', memberId);
}
