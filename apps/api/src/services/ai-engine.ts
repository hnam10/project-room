import { AI_AUTHOR, type Member, type Message } from '@project-room/shared';
import { getAiProvider } from '../ai/index.js';
import type { ConversationMessage } from '../ai/provider.js';
import { createMessage, messagesSinceLastAiReply } from '../repositories/messages.js';
import { listTasks } from '../repositories/tasks.js';
import { createSuggestion } from '../repositories/suggestions.js';

// The AI action engine: watches new chat messages and turns what it notices into
// pending suggestions. It never edits tasks, decisions, or ideas itself.

const MENTIONS_AI = /@ai\b/i;

function toConversation(messages: Message[], members: Map<string, Member>): ConversationMessage[] {
  return messages.map((m) => ({
    id: m.id,
    authorId: m.authorId,
    authorName: members.get(m.authorId)?.name ?? 'AI',
    text: m.text,
  }));
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export async function onMessagePosted(input: {
  projectId: string;
  channelName: string;
  message: Message;
  members: Map<string, Member>;
}): Promise<void> {
  const { projectId, channelName, message, members } = input;
  const ai = getAiProvider();
  const [conversationMessage] = toConversation([message], members);
  if (!conversationMessage) return;

  // Proactive and quiet: an open question goes to the AI Assistant panel, not into the chat.
  const question = await ai.detectOpenQuestion(conversationMessage);
  if (question) {
    await createSuggestion(projectId, {
      kind: 'decision',
      title: `Open question: ${question.topic}`,
      proposal: question.topic.charAt(0).toUpperCase() + question.topic.slice(1),
      reason: 'This sounds like a choice the team hasn’t settled. Logging it keeps it visible until someone decides.',
      quote: message.text,
      cite: `${conversationMessage.authorName} · #${channelName} · ${timeLabel(message.createdAt)}`,
      sourceMessageId: message.id,
    });
  }

  if (MENTIONS_AI.test(message.text)) await replyWithActionItems(projectId, message.channelId, members);
}

async function replyWithActionItems(projectId: string, channelId: string, members: Map<string, Member>): Promise<void> {
  const ai = getAiProvider();
  const [recent, tasks] = await Promise.all([messagesSinceLastAiReply(projectId, channelId), listTasks(projectId)]);
  const items = await ai.extractActionItems({
    messages: toConversation(recent, members),
    existingTaskTitles: tasks.map((t) => t.title),
  });

  if (!items.length) {
    await createMessage({
      projectId,
      channelId,
      authorId: AI_AUTHOR,
      text: ai.isMock
        ? 'I didn’t find new action items in the recent messages. Try phrasing commitments like “I’ll work on…” or open needs like “we still need to…”. (Mock AI — connect a provider for real answers.)'
        : 'I didn’t find new action items in the recent messages.',
    });
    return;
  }

  const suggestion = await createSuggestion(projectId, {
    kind: 'action_items',
    title: `${items.length} action item${items.length === 1 ? '' : 's'} from the conversation`,
    reason: 'A team member asked the AI to turn the recent discussion into tasks.',
    items,
  });
  await createMessage({
    projectId,
    channelId,
    authorId: AI_AUTHOR,
    text: 'I’ve detected the following action items:',
    suggestionId: suggestion.id,
  });
}
