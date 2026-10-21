import { AI_AUTHOR, type Member, type Message } from '@project-room/shared';
import { getAiProvider } from '../ai/index.js';
import type { ConversationMessage } from '../ai/provider.js';
import { createMessage, messagesSinceLastAiReply } from '../repositories/messages.js';
import { listTasks } from '../repositories/tasks.js';
import { createSuggestion, listSuggestions } from '../repositories/suggestions.js';

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

/** Where a quote came from, so the suggestion can say "Morgan · #general · 14:02". */
function citeFor(
  quote: string | null,
  messages: Message[],
  conversation: ConversationMessage[],
  channelName: string,
): {
  cite: string | null;
  sourceMessageId: string | null;
} {
  if (!quote) return { cite: null, sourceMessageId: null };
  const wanted = quote.replace(/\s+/g, ' ').trim().toLowerCase();
  const index = conversation.findIndex((m) => m.text.replace(/\s+/g, ' ').toLowerCase().includes(wanted));
  const source = messages[index];
  const speaker = conversation[index];
  if (!source || !speaker) return { cite: null, sourceMessageId: null };
  return { cite: `${speaker.authorName} · #${channelName} · ${timeLabel(source.createdAt)}`, sourceMessageId: source.id };
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
  // A model failure here must not block an @AI request in the same message.
  try {
    const question = await ai.detectOpenQuestion(conversationMessage);
    if (question) {
      await createSuggestion(projectId, {
        kind: 'decision',
        title: question.outcome ? `Decision made: ${question.topic}` : `Open question: ${question.topic}`,
        proposal: question.topic,
        outcome: question.outcome,
        reason: question.reason,
        quote: question.quote,
        cite: question.quote ? `${conversationMessage.authorName} · #${channelName} · ${timeLabel(message.createdAt)}` : null,
        sourceMessageId: question.quote ? message.id : null,
      });
    }
  } catch (error) {
    console.error('Open-question check failed for message', message.id, error);
  }

  if (MENTIONS_AI.test(message.text)) await replyToMention(projectId, message.channelId, channelName, members);
}

async function replyToMention(projectId: string, channelId: string, channelName: string, members: Map<string, Member>): Promise<void> {
  const ai = getAiProvider();
  const say = (text: string, suggestionId?: string) => createMessage({ projectId, channelId, authorId: AI_AUTHOR, text, suggestionId });

  const [recent, tasks, pending] = await Promise.all([
    messagesSinceLastAiReply(projectId, channelId),
    listTasks(projectId),
    listSuggestions(projectId),
  ]);
  const conversation = toConversation(recent, members);

  let analysis;
  try {
    analysis = await ai.analyzeConversation({
      messages: conversation,
      tasks: tasks.map((t) => ({
        id: t.id,
        num: t.num,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assigneeId: t.assigneeId,
        dueDate: t.dueDate,
      })),
      members: [...members.values()].map((m) => ({ id: m.id, name: m.name, role: m.role })),
    });
  } catch (error) {
    console.error('AI analysis failed', error);
    await say('I couldn’t reach the AI model just now, so nothing was suggested. Please try again in a moment.');
    return;
  }

  // Don't pile up duplicates of things already waiting for review.
  const waiting = pending.filter((s) => s.status === 'pending');
  const seenDecisions = new Set(waiting.filter((s) => s.kind === 'decision').map((s) => s.proposal?.toLowerCase()));
  const seenRisks = new Set(waiting.filter((s) => s.kind === 'risk').map((s) => s.taskId));

  let panelCount = 0;
  for (const d of analysis.decisions) {
    if (seenDecisions.has(d.topic.toLowerCase())) continue;
    await createSuggestion(projectId, {
      kind: 'decision',
      title: d.outcome ? `Decision made: ${d.topic}` : `Open question: ${d.topic}`,
      proposal: d.topic,
      outcome: d.outcome,
      reason: d.reason,
      quote: d.quote,
      ...citeFor(d.quote, recent, conversation, channelName),
    });
    panelCount++;
  }
  for (const r of analysis.risks) {
    if (seenRisks.has(r.taskId)) continue;
    await createSuggestion(projectId, {
      kind: 'risk',
      title: r.title,
      reason: r.reason,
      quote: r.quote,
      taskId: r.taskId,
      ...citeFor(r.quote, recent, conversation, channelName),
    });
    panelCount++;
  }

  const panelNote = panelCount
    ? ` I also added ${panelCount} decision${panelCount === 1 ? '' : 's'} or risk${panelCount === 1 ? '' : 's'} to the AI Assistant panel.`
    : '';
  const items = analysis.actionItems;
  if (!items.length) {
    await say(
      panelCount
        ? `I didn’t find new action items.${panelNote}`
        : ai.isMock
          ? 'I didn’t find new action items in the recent messages. Try phrasing commitments like “I’ll work on…” or open needs like “we still need to…”. (Mock AI — set ANTHROPIC_API_KEY for real answers.)'
          : 'I didn’t find new action items in the recent messages.',
    );
    return;
  }

  const suggestion = await createSuggestion(projectId, {
    kind: 'action_items',
    title: `${items.length} action item${items.length === 1 ? '' : 's'} from the conversation`,
    reason: 'A team member asked the AI to turn the recent discussion into tasks.',
    items,
  });
  await say(`I’ve detected the following action items:${panelNote}`, suggestion.id);
}
