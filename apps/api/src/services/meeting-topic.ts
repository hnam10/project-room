import type { Suggestion } from '@project-room/shared';
import type { MeetingTopic } from '../ai/meeting.js';
import { createSuggestion } from '../repositories/suggestions.js';

const key = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Keep one reviewable topic per meeting while leaving all idea suggestions pending. */
export async function proposeMeetingTopic(
  projectId: string,
  meetingId: string,
  topic: MeetingTopic | null | undefined,
  currentTopic: { id: string; title: string } | null,
  suggestions: Suggestion[],
  cite: string | null,
  id?: string,
): Promise<Suggestion | null> {
  if (!topic || !key(topic.title) || key(topic.title) === key(currentTopic?.title ?? '')) return null;
  if (
    suggestions.some(
      (suggestion) =>
        suggestion.kind === 'brainstorm_topic' &&
        (suggestion.meetingId === meetingId ||
          (suggestion.status === 'pending' && key(suggestion.ideaDraft?.title ?? '') === key(topic.title))),
    )
  )
    return null;
  return createSuggestion(
    projectId,
    {
      meetingId,
      kind: 'brainstorm_topic',
      title: `Brainstorm topic: ${topic.title}`,
      reason: topic.reason,
      quote: topic.quote,
      cite,
      sourceLineId: topic.sourceLineId,
      ideaId: null,
      ideaDraft: { title: topic.title, description: topic.description, theme: 'Option' },
    },
    id,
  );
}
