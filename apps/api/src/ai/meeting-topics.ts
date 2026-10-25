/** Normalize titles without merging genuinely different goals that share a few words. */
export const meetingTopicKey = (title: string) =>
  title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function matchesMeetingTopic(
  proposal: { title: string; existingTopicId?: string | null },
  topics: { id: string; title: string }[],
): boolean {
  const title = meetingTopicKey(proposal.title);
  return topics.some((topic) => topic.id === proposal.existingTopicId || meetingTopicKey(topic.title) === title);
}
