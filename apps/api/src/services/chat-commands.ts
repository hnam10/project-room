import { AI_AUTHOR, ideaCreateSchema, taskCreateSchema, type Message } from '@project-room/shared';
import { createIdea, listIdeas } from '../repositories/ideas.js';
import { createMessage, listMessages } from '../repositories/messages.js';
import { createTask } from '../repositories/tasks.js';

type ChatCommand = { kind: 'problem' | 'idea' | 'task'; title: string; topic?: string };

/** Removes optional surrounding quotes without changing a member's chosen wording. */
function unquote(text: string): string {
  const value = text.trim();
  return /^(?:".*"|'.*'|“.*”)$/s.test(value) ? value.slice(1, -1).trim() : value;
}

/** Recognizes member instructions, rather than treating ordinary discussion as permission to write. */
export function parseChatCommand(text: string): ChatCommand | null {
  const tagged = /^@ai\b/i.test(text.trim());
  const request = text
    .trim()
    .replace(/^@ai\b\s*[,：:]?\s*/i, '')
    .replace(/^(?:(?:i|we)\s+(?:would like|want)\s+to\s+|let['’]s\s+|let us\s+)/i, '')
    .replace(/^(?:(?:please|can you|could you)\s+)+/i, '');
  const match = /^(?:create|add)\s+(?:(?:a|an)\s+)?(topic|idea|task)(?:\s+(.*))?$/is.exec(request);
  const personalIdea = /^i have an idea(?:\s+for)?(?:\s+(.*))?$/is.exec(request);
  if (!match && !personalIdea) {
    // A stated creation goal supplies the topic itself, e.g. "I would like to create a Fitness app".
    const goal = /^create\s+(?:a|an)\s+(.+)$/is.exec(request);
    if (!goal || /^(?:tasks?|topics?|ideas?|polls?|meetings?|channels?|votes?|reminders?|notifications?)\b/i.test(goal[1]!)) return null;
    return { kind: 'problem', title: unquote(goal[1]!) };
  }
  const body = (match?.[2] ?? personalIdea?.[1] ?? '').trim();
  const entity = match?.[1]?.toLowerCase();
  if (entity === 'task') return tagged ? { kind: 'task', title: unquote(body) } : null;
  if (entity === 'topic') return { kind: 'problem', title: unquote(body) };
  // A quoted title can contain routing words; it is still a single member-authored idea.
  if (/^(?:"[^"]*"|'[^']*'|“[^”]*”)$/s.test(body)) return { kind: 'idea', title: unquote(body) };
  const target =
    /^(.+?)\s+(?:to|in|under)\s+(?:the\s+)?topic\s+(.+)$/is.exec(body) ??
    /^(.+?)\s+(?:to|in|under)\s+(.+?)\s+topic$/is.exec(body) ??
    (!tagged || personalIdea ? /^(.+)\s+(?:to|under)\s+(.+)$/is.exec(body) : null);
  return { kind: 'idea', title: unquote(target?.[1] ?? body), ...(target ? { topic: unquote(target[2]!) } : {}) };
}

const titleKey = (title: string) =>
  title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Prefer exact names, then a distinctive shortened name; never choose between multiple matches. */
function matchingTopics<T extends { title: string }>(topics: T[], title: string): T[] {
  const key = titleKey(title);
  const exact = topics.filter((topic) => titleKey(topic.title) === key);
  if (exact.length) return exact;
  const words = key.split(' ');
  const distinctive = words.filter(
    (word) => !['a', 'an', 'the', 'for', 'with', 'and', 'of', 'to', 'in', 'app', 'project', 'topic'].includes(word),
  );
  if (distinctive.length < 2) return [];
  return topics.filter((topic) => titleKey(topic.title).startsWith(`${key} `));
}

/** Executes member-authored commands before any model call; ambiguous targets never mutate a board. */
export async function runChatCommand(projectId: string, message: Message): Promise<boolean> {
  if (message.authorId === AI_AUTHOR) return false;
  let command = parseChatCommand(message.text);
  if (!command && !/@ai\b/i.test(message.text)) {
    // A bare create-task command consumes only that member's next message in this channel.
    const recent = await listMessages(projectId, message.channelId, 80);
    const index = recent.findIndex((item) => item.id === message.id);
    const previous = index >= 0 ? recent.slice(0, index) : recent.filter((item) => item.createdAt < message.createdAt);
    const lastOwn = [...previous].reverse().find((item) => item.authorId === message.authorId);
    const pending = lastOwn && parseChatCommand(lastOwn.text);
    if (pending?.kind === 'task' && !pending.title) command = { kind: 'task', title: message.text.trim() };
  }
  if (!command) return false;
  const say = (text: string) => createMessage({ projectId, channelId: message.channelId, authorId: AI_AUTHOR, text });
  if (command.kind === 'task') {
    if (!command.title) {
      await say('What should the task be? Send the task title in your next message here, or use @AI create task Write the demo script.');
      return true;
    }
    const task = taskCreateSchema.safeParse({ title: command.title });
    if (!task.success) {
      await say('Use a task title between 1 and 120 characters: @AI create task Write the demo script');
      return true;
    }
    const created = await createTask(projectId, task.data);
    await say(`Created task #${created.num}: “${created.title}”. It is unassigned in To Do.`);
    return true;
  }
  const parsed = ideaCreateSchema.safeParse({ kind: command.kind, title: command.title });
  if (!parsed.success) {
    await say('Use a topic or idea title between 1 and 80 characters. For example: @AI create topic Weekend plans');
    return true;
  }
  const ideas = await listIdeas(projectId);
  const topics = ideas.filter((idea) => idea.kind === 'problem');
  if (command.kind === 'problem') {
    const matches = matchingTopics(topics, command.title);
    if (matches.length > 1) {
      await say(
        `More than one existing topic matches “${command.title}”. Use the full topic title before adding an idea. No new board was created.`,
      );
      return true;
    }
    if (matches.length === 1) {
      await say(`The topic “${matches[0]!.title}” already exists. No new board was created.`);
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
      .find(
        (item) =>
          item.authorId === AI_AUTHOR &&
          /^(?:Created topic “.*”\.|Added idea “.*” to topic “.*”\.|The topic “.*” already exists\. No new board was created\.)$/s.test(
            item.text,
          ),
      );
    targetTitle = context?.text.match(
      /(?:Created topic |to topic |The topic )“(.*)”(?:\.| already exists\. No new board was created\.)$/s,
    )?.[1];
  }
  const matches = targetTitle ? matchingTopics(topics, targetTitle) : topics;
  if (matches.length !== 1) {
    await say(
      targetTitle
        ? `I couldn’t identify one topic named “${targetTitle}”. Use its full title: add idea pool to Weekend plans topic`
        : 'Which topic should this idea go under? For example: add idea pool to Weekend plans topic',
    );
    return true;
  }
  const topic = matches[0]!;
  if (ideas.some((idea) => idea.topicId === topic.id && titleKey(idea.title) === titleKey(command.title))) {
    await say(`The idea “${command.title}” already exists in topic “${topic.title}”.`);
    return true;
  }
  await createIdea(projectId, message.authorId, { ...parsed.data, topicId: topic.id });
  await say(`Added idea “${command.title}” to topic “${topic.title}”.`);
  return true;
}
