import { AI_AUTHOR, ideaCreateSchema, taskCreateSchema, type Message } from '@project-room/shared';
import { createIdea, listIdeas } from '../repositories/ideas.js';
import { createMessage, listMessages } from '../repositories/messages.js';
import { createTask } from '../repositories/tasks.js';
import { createSuggestion, listSuggestions } from '../repositories/suggestions.js';
import { getAiProvider } from '../ai/index.js';
import type { ChatIntent, ConversationMessage } from '../ai/provider.js';

type ChatCommand = {
  kind: 'problem' | 'idea' | 'task';
  title: string;
  topic?: string;
  topicId?: string;
  topicVersion?: number;
  pending?: boolean;
};

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

/** Match harmless case/spacing changes, but save the actual member-authored excerpt. */
function sourceExcerpt(text: string, excerpt: string | null): string | null {
  if (!excerpt?.trim()) return null;
  const pattern = excerpt
    .trim()
    .split(/\s+/u)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return new RegExp(pattern, 'iu').exec(text)?.[0] ?? null;
}

/** Complete omitted model ids conservatively; unknown explicit targets never fall back to a sole board. */
function resolveIntentTopic<T extends { id: string; title: string; description: string }>(
  intent: ChatIntent,
  topics: T[],
  message: Message,
): ChatIntent {
  if (!['add_idea', 'suggest_idea'].includes(intent.action) || intent.topicId !== null) return intent;
  const reference = intent.topicReference;
  if (reference && !sourceExcerpt(message.text, reference)) return intent;
  const words = (reference ? titleKey(reference).split(' ') : []).filter(
    (word) => !['the', 'a', 'an', 'our', 'my', 'this', 'that', 'app', 'application', 'project', 'topic', 'board'].includes(word),
  );
  const matches = words.length
    ? topics.filter((topic) => {
        const content = new Set(titleKey(`${topic.title} ${topic.description}`).split(' '));
        return words.every((word) => content.has(word));
      })
    : topics;
  return matches.length === 1 ? { ...intent, topicId: matches[0]!.id } : intent;
}

function intentIssue(intent: ChatIntent, message: Message, previous: Message[], topics: { id: string }[]): string | null {
  if (intent.action === 'none') return null;
  if (intent.action === 'clarify')
    return 'Check whether the latest message already names a complete creation goal or concrete idea. New topics need neither an idea nor an existing topic id. Direct additions use add_idea; tentative contributions use suggest_idea. Use the sole topic for an implied target, or infer a clear topic match from the supplied names and context.';
  if (!intent.explicitRequest && intent.action !== 'suggest_idea')
    return 'The selected action needs a clear current member request; otherwise return none.';
  if (!sourceExcerpt(message.text, intent.requestQuote)) return 'Copy requestQuote from the latest member message.';
  if (intent.topicReference && !sourceExcerpt(message.text, intent.topicReference))
    return 'Copy topicReference from the latest member message, or use null for an implicit target.';
  const selected = topics.some((topic) => topic.id === intent.topicId);
  if (intent.topicId && !selected) return 'The selected topicId is not in the supplied project topics.';
  if (intent.action === 'use_topic' || intent.action === 'add_idea' || intent.action === 'suggest_idea') {
    if (!selected)
      return 'Choose an existing topicId for add_idea/suggest_idea/use_topic. Infer shortened or semantic references from topic titles/descriptions and chat; use the sole topic for implicit references. Clarify an explicitly unknown or ambiguous target. A new standalone goal uses create_topic with topicId=null.';
    if (intent.action === 'use_topic') return null;
  }
  if (intent.action === 'create_topic' && selected) return null;
  const source = [message, ...previous.slice(-20)].find(
    (item) => item.id === intent.titleSourceMessageId && item.authorId === message.authorId,
  );
  if (!source)
    return `Use the real titleSourceMessageId from the latest message (${message.id}) or a referenced recent message by this member.`;
  if (!sourceExcerpt(source.text, intent.title)) return 'Copy the title from the member’s message without paraphrasing or inventing words.';
  return null;
}

/** Literal commands stay deterministic; natural requests use contextual extraction before validated writes. */
export async function runChatCommand(projectId: string, message: Message): Promise<boolean> {
  if (message.authorId === AI_AUTHOR) return false;
  const say = (text: string) => createMessage({ projectId, channelId: message.channelId, authorId: AI_AUTHOR, text });
  const literal =
    /^(?:@ai\b\s*[,：:]?\s*)?(?:(?:please|can you|could you)\s+)?(?:create|add)\s+(?:(?:a|an)\s+)?(?:topic|idea|task)\b/i.test(
      message.text.trim(),
    );
  const literalCommand = literal ? parseChatCommand(message.text) : null;
  let command = literalCommand?.kind === 'task' ? literalCommand : null;
  const recent = await listMessages(projectId, message.channelId, 80);
  const index = recent.findIndex((item) => item.id === message.id);
  const previous = index >= 0 ? recent.slice(0, index) : recent.filter((item) => item.createdAt < message.createdAt);
  if (!command && !/@ai\b/i.test(message.text)) {
    // A bare create-task command consumes only that member's next message in this channel.
    const lastOwn = [...previous].reverse().find((item) => item.authorId === message.authorId);
    const pending = lastOwn && parseChatCommand(lastOwn.text);
    if (pending?.kind === 'task' && !pending.title) command = { kind: 'task', title: message.text.trim() };
  }
  if (!command) {
    const topics = (await listIdeas(projectId)).filter((idea) => idea.kind === 'problem');
    const asContext = (item: Message): ConversationMessage => ({
      id: item.id,
      authorId: item.authorId,
      authorName: item.authorId === AI_AUTHOR ? 'Assistant' : item.authorId,
      text: item.text.slice(0, 2000),
    });
    let intent: ChatIntent | null;
    try {
      const input = {
        message: asContext(message),
        recentMessages: previous.slice(-20).map(asContext),
        topics: topics.map(({ id, title, description }) => ({ id, title, description })),
      };
      intent = await getAiProvider().interpretChatIntent(input);
      if (intent) intent = resolveIntentTopic(intent, topics, message);
      const issue = intent && intentIssue(intent, message, previous, topics);
      if (issue) {
        intent = (await getAiProvider().interpretChatIntent({ ...input, validationFeedback: issue })) ?? intent;
        if (intent) intent = resolveIntentTopic(intent, topics, message);
      }
    } catch {
      // An unavailable classifier never authorizes a write or interrupts every ordinary chat line.
      console.warn('Chat intent interpretation unavailable; only literal commands can run.');
      if (!literalCommand) return false;
      intent = null;
    }
    if (intent === null) {
      // The labelled local mock retains literal/template support, without pretending to understand context.
      command = parseChatCommand(message.text);
    } else {
      if (intent.action === 'none') return false;
      const clarify = async () => {
        await say(
          'Please clarify the topic and idea you want to add. You can use “create topic TITLE” or “add idea TITLE to TOPIC topic”.',
        );
        return true;
      };
      if (
        intent.action === 'clarify' ||
        (!intent.explicitRequest && intent.action !== 'suggest_idea') ||
        !sourceExcerpt(message.text, intent.requestQuote) ||
        (intent.topicReference && !sourceExcerpt(message.text, intent.topicReference))
      ) {
        return clarify();
      }
      // Re-read project topics after the model call: removed boards and foreign/hallucinated ids are invalid.
      const currentTopics = (await listIdeas(projectId)).filter((idea) => idea.kind === 'problem');
      intent = resolveIntentTopic(intent, currentTopics, message);
      const selectedTopicId = intent.topicId;
      const selected = currentTopics.find((topic) => topic.id === selectedTopicId);
      if (intent.topicId && !selected) return clarify();
      if (intent.action === 'use_topic' || (intent.action === 'create_topic' && selected)) {
        if (!selected) return clarify();
        await say(`The topic “${selected.title}” already exists. No new board was created.`);
        return true;
      }
      if ((intent.action === 'add_idea' || intent.action === 'suggest_idea') && !selected) return clarify();
      const titleSourceMessageId = intent.titleSourceMessageId;
      const source = [message, ...previous.slice(-20)].find(
        (item) => item.id === titleSourceMessageId && item.authorId === message.authorId,
      );
      const title = source && sourceExcerpt(source.text, intent.title);
      if (!title) return clarify();
      command = {
        kind: intent.action === 'create_topic' ? 'problem' : 'idea',
        title,
        pending: intent.action === 'suggest_idea',
        ...(selected ? { topicId: selected.id, topic: selected.title, topicVersion: selected.boardVersion } : {}),
      };
    }
  }
  if (!command) return false;
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
  const matches = command.topicId
    ? topics.filter((topic) => topic.id === command.topicId)
    : targetTitle
      ? matchingTopics(topics, targetTitle)
      : topics;
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
  if (command.pending) {
    const pending = (await listSuggestions(projectId)).some(
      (suggestion) =>
        suggestion.kind === 'idea' &&
        suggestion.status === 'pending' &&
        suggestion.topicId === topic.id &&
        suggestion.topicVersion === topic.boardVersion &&
        titleKey(suggestion.ideaDraft?.title ?? '') === titleKey(command.title),
    );
    if (!pending)
      await createSuggestion(
        projectId,
        {
          kind: 'idea',
          title: `New idea: ${parsed.data.title}`,
          topicId: topic.id,
          topicVersion: command.topicVersion ?? topic.boardVersion,
          reason: `A team member is considering this idea for “${topic.title}”. Review it before adding it to the board.`,
          quote: message.text,
          sourceMessageId: message.id,
          ideaDraft: { title: parsed.data.title, description: '', theme: parsed.data.theme },
        },
        `chat-idea-${message.id}`,
      );
    // Tentative contributions go to the review panel without interrupting ordinary chat.
    if (/@ai\b/i.test(message.text)) await say(`The idea “${parsed.data.title}” is waiting for review under “${topic.title}”.`);
    return true;
  }
  await createIdea(projectId, message.authorId, { ...parsed.data, topicId: topic.id });
  await say(`Added idea “${command.title}” to topic “${topic.title}”.`);
  return true;
}
