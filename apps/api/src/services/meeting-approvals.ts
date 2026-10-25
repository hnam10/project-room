import type { Suggestion } from '@project-room/shared';
import { ConflictError } from '../db/records.js';
import { createIdea, getIdea, updateIdea } from '../repositories/ideas.js';
import { isSignificantIdeaChange } from './idea-change.js';
import { getMeeting, setCarryOver } from '../repositories/meetings.js';
import { createPoll } from '../repositories/polls.js';
import { assignSuggestionTopic, resolveSuggestion } from '../repositories/suggestions.js';
import { getTopic, resetTopic } from '../repositories/brainstorm-topics.js';

// Approval paths for suggestions that come from meetings (and idea/poll suggestions in general).

export async function approveIdea(
  projectId: string,
  suggestion: Suggestion,
  memberId: string,
  topicId?: string | null,
): Promise<Suggestion> {
  const draft = suggestion.ideaDraft;
  if (!draft) throw new ConflictError('Suggestion has no idea to add');
  if (suggestion.ideaId) {
    const before = await getIdea(projectId, suggestion.ideaId);
    const patch = { description: draft.description };
    await updateIdea(projectId, suggestion.ideaId, patch, isSignificantIdeaChange(before, patch));
  } else {
    const topic = await getTopic(projectId, suggestion.topicId ?? topicId);
    if (!suggestion.topicId) await assignSuggestionTopic(projectId, suggestion.id, topic.id);
    await createIdea(
      projectId,
      memberId,
      { ...draft, topicId: topic.id },
      { suggestionId: suggestion.id, researchSources: suggestion.researchSources ?? [] },
    );
  }
  return resolveSuggestion(suggestion.id, 'approved', memberId);
}

/** A chat brainstorm proposes its topic; only the member's approval creates or replaces the board topic. */
/** Applies an explicitly approved topic proposal, optionally replacing one named board. */
export async function approveBrainstormTopic(
  projectId: string,
  suggestion: Suggestion,
  memberId: string,
  replaceTopicId?: string,
): Promise<Suggestion> {
  const draft = suggestion.ideaDraft;
  if (!draft) throw new ConflictError('Suggestion has no brainstorm topic');
  if (suggestion.ideaId) {
    if (replaceTopicId !== suggestion.ideaId) throw new ConflictError('Confirm the specific topic to replace before clearing its board');
    const before = await getIdea(projectId, suggestion.ideaId);
    if (before.kind !== 'problem') throw new ConflictError('The suggested topic no longer points to a brainstorm topic');
    const patch = { title: draft.title, description: draft.description.slice(0, 240) };
    await resetTopic(projectId, before.id, 'all', patch, suggestion.id);
  } else {
    await createIdea(
      projectId,
      memberId,
      {
        title: draft.title,
        description: draft.description.slice(0, 240),
        theme: draft.theme,
        kind: 'problem',
      },
      { suggestionId: suggestion.id, researchSources: [] },
    );
  }
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
