import type { Suggestion } from '@project-room/shared';
import type { MeetingTopic } from '../ai/meeting.js';
import { createSuggestion } from '../repositories/suggestions.js';
import { listIdeas } from '../repositories/ideas.js';
import { matchesMeetingTopic, meetingTopicKey as key } from '../ai/meeting-topics.js';

/** Propose distinct new topic boards without changing existing boards or pending ideas. */
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
  // Re-read all boards: a member may have approved a topic while the AI was running.
  const existingTopics = (await listIdeas(projectId)).filter((idea) => idea.kind === 'problem');
  if (matchesMeetingTopic(topic, existingTopics)) return null;
  if (
    suggestions.some(
      (suggestion) =>
        suggestion.kind === 'brainstorm_topic' &&
        key(suggestion.ideaDraft?.title ?? '') === key(topic.title) &&
        (suggestion.meetingId === meetingId || suggestion.status === 'pending'),
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
