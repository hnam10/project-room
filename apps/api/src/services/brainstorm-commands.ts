import { AI_AUTHOR, ideaCreateSchema, type Message } from '@project-room/shared';
import { createIdea, listIdeas } from '../repositories/ideas.js';
import { createMessage, listMessages } from '../repositories/messages.js';

type BrainstormCommand = { kind: 'problem' | 'idea'; title: string; topic?: string };

/** Removes optional surrounding quotes without changing a member's chosen wording. */
function unquote(text: string): string {
  const value = text.trim();
  return /^(?:".*"|'.*'|“.*”)$/s.test(value) ? value.slice(1, -1).trim() : value;
}

/** Recognizes explicit creation commands, leaving conversational requests to the AI provider. */
export function parseBrainstormCommand(text: string): BrainstormCommand | null {
  const request = text.trim().replace(/^@ai\b\s*[,：:]?\s*/i, '');
  if (request === text.trim()) return null;
  const match = /^(?:(?:please|can you|could you)\s+)?(?:create|add)\s+(?:a\s+)?(topic|idea)(?:\s+(.*))?$/is.exec(request);
  if (!match) return null;
  const body = (match[2] ?? '').trim();
  if (match[1]!.toLowerCase() === 'topic') return { kind: 'problem', title: unquote(body) };
  const target =
    /^(.+?)\s+(?:to|in|under)\s+(?:the\s+)?topic\s+(.+)$/is.exec(body) ?? /^(.+?)\s+(?:to|in|under)\s+(.+?)\s+topic$/is.exec(body);
  return { kind: 'idea', title: unquote(target?.[1] ?? body), ...(target ? { topic: unquote(target[2]!) } : {}) };
}

/** Executes member-authored commands before any model call; ambiguous targets never mutate a board. */
export async function runBrainstormCommand(projectId: string, message: Message): Promise<boolean> {
  if (message.authorId === AI_AUTHOR) return false;
  const command = parseBrainstormCommand(message.text);
  if (!command) return false;
  const say = (text: string) => createMessage({ projectId, channelId: message.channelId, authorId: AI_AUTHOR, text });
  const parsed = ideaCreateSchema.safeParse({ kind: command.kind, title: command.title });
  if (!parsed.success) {
    await say('Use a topic or idea title between 1 and 80 characters. For example: @AI create topic Weekend plans');
    return true;
  }
  const ideas = await listIdeas(projectId);
  const topics = ideas.filter((idea) => idea.kind === 'problem');
  const key = (title: string) => title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  if (command.kind === 'problem') {
    if (topics.some((topic) => key(topic.title) === key(command.title))) {
      await say(`The topic “${command.title}” already exists. No new board was created.`);
      return true;
    }
    await createIdea(projectId, message.authorId, parsed.data);
    await say(`Created topic “${command.title}”.`);
    return true;
  }
  let targetTitle = command.topic;
  if (!targetTitle) {
    // Only successful command replies in this channel establish an implicit topic.
    const recent = await listMessages(projectId, message.channelId, 80);
    const index = recent.findIndex((item) => item.id === message.id);
    const previous = index >= 0 ? recent.slice(0, index) : recent.filter((item) => item.createdAt < message.createdAt);
    const context = [...previous]
      .reverse()
      .find((item) => item.authorId === AI_AUTHOR && /^(?:Created topic “.*”\.|Added idea “.*” to topic “.*”\.)$/s.test(item.text));
    targetTitle = context?.text.match(/(?:Created topic |to topic )“(.*)”\.$/s)?.[1];
  }
  const matches = targetTitle ? topics.filter((topic) => key(topic.title) === key(targetTitle)) : topics;
  if (matches.length !== 1) {
    await say(
      targetTitle
        ? `I couldn’t identify one topic named “${targetTitle}”. Use its full title: @AI add idea pool to Weekend plans topic`
        : 'Which topic should this idea go under? For example: @AI add idea pool to Weekend plans topic',
    );
    return true;
  }
  const topic = matches[0]!;
  if (ideas.some((idea) => idea.topicId === topic.id && key(idea.title) === key(command.title))) {
    await say(`The idea “${command.title}” already exists in topic “${topic.title}”.`);
    return true;
  }
  await createIdea(projectId, message.authorId, { ...parsed.data, topicId: topic.id });
  await say(`Added idea “${command.title}” to topic “${topic.title}”.`);
  return true;
}
