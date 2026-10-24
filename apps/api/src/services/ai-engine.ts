import { AI_AUTHOR, TASK_STATUSES, type ActionItem, type Decision, type Member, type Message, type Suggestion } from '@project-room/shared';
import { getAiProvider } from '../ai/index.js';
import type { AiProvider, ConversationMessage, FileExcerpt, IdeaProposal, ProjectLookup } from '../ai/provider.js';
import { listDecisions } from '../repositories/decisions.js';
import { listIdeas } from '../repositories/ideas.js';
import { createMessage, messagesForMention, searchMessages } from '../repositories/messages.js';
import { createSuggestion, listSuggestions } from '../repositories/suggestions.js';
import { listTasks } from '../repositories/tasks.js';
import { getProjectMemory } from './project-memory.js';
import { researchWeb } from './research.js';

// The AI action engine: watches new chat messages and turns what it notices into
// pending suggestions. It never edits tasks, decisions, or ideas itself.

const MENTIONS_AI = /@ai\b/i;
const ASKS_TO_BRAINSTORM = /\b(brainstorm|ideas?|ideate)\b/i;
const topicKey = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function toConversation(messages: (Message & { channelName?: string | null })[], members: Map<string, Member>): ConversationMessage[] {
  return messages.map((m) => ({
    id: m.id,
    authorId: m.authorId,
    authorName: members.get(m.authorId)?.name ?? 'AI',
    text: m.text,
    createdAt: m.createdAt,
    channelName: m.channelName ?? undefined,
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
  files: FileExcerpt[],
): {
  cite: string | null;
  sourceMessageId: string | null;
} {
  if (!quote) return { cite: null, sourceMessageId: null };
  const wanted = quote.replace(/\s+/g, ' ').trim().toLowerCase();
  const index = conversation.findIndex((m) => m.text.replace(/\s+/g, ' ').toLowerCase().includes(wanted));
  const source = messages[index];
  const speaker = conversation[index];
  if (source && speaker) {
    return {
      cite: `${speaker.authorName} · #${speaker.channelName ?? channelName} · ${timeLabel(source.createdAt)}`,
      sourceMessageId: source.id,
    };
  }
  const file = files.find((item) => item.text.replace(/\s+/g, ' ').toLowerCase().includes(wanted));
  if (file) return { cite: file.name, sourceMessageId: null };
  return { cite: null, sourceMessageId: null };
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
  if (!(MENTIONS_AI.test(message.text) && ASKS_TO_BRAINSTORM.test(message.text))) {
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
  }

  if (MENTIONS_AI.test(message.text)) await replyToMention(projectId, message.channelId, channelName, members);
}

const norm = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/** Passages from this project's files. A memory outage leaves @AI working from the chat alone. */
async function fileExcerpts(projectId: string, messages: Message[]): Promise<FileExcerpt[]> {
  const memory = getProjectMemory();
  if (!memory) return [];
  try {
    return await memory.excerpts(projectId, messages.map((message) => message.text).join('\n'));
  } catch (error) {
    console.error('Could not read project files from Agent Memory', error);
    return [];
  }
}

function mentionReply(reply: string, panelCount: number, itemCount: number, isMock: boolean): string {
  const panelNote = panelCount ? ` I also added ${panelCount} suggestion${panelCount === 1 ? '' : 's'} to the AI Assistant panel.` : '';
  const text = reply.trim();
  if (text) return `${text}${panelNote}`;
  if (itemCount) return `I’ve detected the following action items:${panelNote}`;
  if (panelCount) return `I didn’t find new action items.${panelNote}`;
  return isMock
    ? 'I didn’t find new action items in the recent messages. Try phrasing commitments like “I’ll work on…” or open needs like “we still need to…”. (Mock AI — set OPENAI_API_KEY for real answers.)'
    : 'I didn’t find new action items in the recent messages.';
}

/**
 * The mock has no model, so a question with no new tasks is answered from approved decisions.
 * A configured model writes this reply itself, from the thread and any file passages.
 */
async function mockMentionReply(ai: AiProvider, recent: Message[], decisions: Decision[], members: Map<string, Member>): Promise<string> {
  const ask = [...recent].reverse().find((message) => message.authorId !== AI_AUTHOR && MENTIONS_AI.test(message.text));
  if (!ask || !/[?]/.test(ask.text)) return '';
  const draft = await ai.answerFromDecisions({
    question: ask.text,
    decisions: decisions.filter((decision) => decision.status === 'decided'),
    members: [...members.values()].map((member) => ({ id: member.id, name: member.name, role: member.role })),
  });
  const note = '(Mock AI — set OPENAI_API_KEY for a reply that also reads the chat.)';
  if (!draft.sourceDecisionIds.length) return `Nothing in the approved decisions answers that. ${note}`;
  return `${draft.answer.replace(/\s+/g, ' ')} ${note}`;
}

/** Drops tasks the team has already been asked to review, or has already approved. */
function unseenActionItems(items: ActionItem[], suggestions: Suggestion[]): ActionItem[] {
  const covered = suggestions.filter((suggestion) => suggestion.kind === 'action_items' && suggestion.status !== 'dismissed');
  const titles = new Set(covered.flatMap((suggestion) => suggestion.items.map((item) => norm(item.title))));
  const quotes = new Set(covered.flatMap((suggestion) => suggestion.items.flatMap((item) => (item.quote ? [norm(item.quote)] : []))));
  return items.filter((item) => {
    if (titles.has(norm(item.title))) return false;
    return !(item.quote && quotes.has(norm(item.quote)));
  });
}

async function replyToMention(projectId: string, channelId: string, channelName: string, members: Map<string, Member>): Promise<void> {
  const ai = getAiProvider();
  const say = (text: string, suggestionId?: string) => createMessage({ projectId, channelId, authorId: AI_AUTHOR, text, suggestionId });

  const [recent, tasks, pending, boardIdeas, decisions] = await Promise.all([
    messagesForMention(projectId, channelId),
    listTasks(projectId),
    listSuggestions(projectId),
    listIdeas(projectId),
    listDecisions(projectId),
  ]);
  const conversation = toConversation(recent, members);
  const files = await fileExcerpts(projectId, recent);

  const request = recent.at(-1)?.text ?? '';
  if (ASKS_TO_BRAINSTORM.test(request)) {
    const latestRequest = request.replace(/@ai\b/gi, '').trim();
    const genericRequest = /^(?:(?:can you|please)\s+)?(?:brainstorm|ideate|ideas?)(?:\s+(?:this|that|it))?[?.!]*$/i.test(latestRequest);
    const recentContext = conversation
      .slice(0, -1)
      .map((message) => message.text)
      .join(' ')
      .slice(-400);
    const query = genericRequest ? recentContext || latestRequest : latestRequest || recentContext;
    let mode;
    let brainstorm;
    let research = { configured: false, results: [] as Awaited<ReturnType<typeof researchWeb>>['results'], error: null as string | null };
    try {
      mode = await ai.classifyBrainstorm({
        problem: boardIdeas.find((idea) => idea.kind === 'problem') ?? null,
        ideas: boardIdeas.filter((idea) => idea.kind === 'idea'),
        request: query,
      });
      if (mode === 'unclear') {
        await say('I need a more specific goal before suggesting a direction. What outcome is the team trying to create?');
        return;
      }
      if (mode === 'product') research = await researchWeb(query);
      brainstorm = await ai.brainstorm({
        messages: conversation,
        currentTopic: boardIdeas.find((idea) => idea.kind === 'problem') ?? null,
        existingIdeas: boardIdeas.map((idea) => ({ title: idea.title, description: idea.description })),
        research: research.results,
        mode,
      });
    } catch (error) {
      console.error('AI brainstorming failed', error);
      await say('I couldn’t develop the brainstorm just now. No topic or idea suggestions were created; please try again in a moment.');
      return;
    }

    const waitingTitles = new Set(
      pending
        .filter((suggestion) => suggestion.status === 'pending' && suggestion.kind === 'idea')
        .map((suggestion) => suggestion.ideaDraft?.title.toLowerCase()),
    );
    const currentTopic = boardIdeas.find((idea) => idea.kind === 'problem');
    const proposedTopic = brainstorm.topic;
    const topicAlreadyPending = pending.some(
      (suggestion) =>
        suggestion.status === 'pending' &&
        suggestion.kind === 'brainstorm_topic' &&
        topicKey(suggestion.ideaDraft?.title ?? '') === topicKey(proposedTopic?.title ?? ''),
    );
    let topicCreated = false;
    if (proposedTopic && topicKey(proposedTopic.title) !== topicKey(currentTopic?.title ?? '') && !topicAlreadyPending) {
      const citation = citeFor(proposedTopic.quote, recent, conversation, channelName, files);
      await createSuggestion(projectId, {
        kind: 'brainstorm_topic',
        title: `Brainstorm topic: ${proposedTopic.title}`,
        reason: proposedTopic.reason,
        quote: proposedTopic.quote,
        ...citation,
        ideaId: null,
        ideaDraft: { title: proposedTopic.title, description: proposedTopic.description, theme: mode === 'product' ? 'Product' : 'Option' },
      });
      topicCreated = true;
    }
    let created = 0;
    let attachedSources = 0;
    for (const proposal of brainstorm.ideas) {
      if (waitingTitles.has(proposal.draft.title.toLowerCase())) continue;
      const citation = citeFor(proposal.quote, recent, conversation, channelName, files);
      const researchSources = proposal.sourceUrls
        .map((url) => research.results.find((result) => result.url === url))
        .filter((source): source is NonNullable<typeof source> => !!source)
        .map(({ title, url }) => ({ title, url }));
      await createSuggestion(projectId, {
        kind: 'idea',
        title: `New idea: ${proposal.draft.title}`,
        reason: proposal.reason,
        quote: proposal.quote,
        ...citation,
        researchSources,
        ideaDraft: proposal.draft,
      });
      created++;
      attachedSources += researchSources.length;
    }

    const researchNote =
      mode === 'non_product'
        ? ' These ideas or strategies use the team’s conversation rather than unrelated web results.'
        : !research.configured
          ? ' Web research is not configured, so these use the conversation only; add TAVILY_API_KEY to enable sourced research.'
          : research.error
            ? ' Web research failed this time, so these use the conversation only.'
            : attachedSources
              ? ' I used current web results and attached the sources.'
              : research.results.length
                ? ' I reviewed current web results, but none materially supported the final drafts, so no sources were attached.'
                : ' The web search returned no usable sources.';
    await say(
      topicCreated || created
        ? `${topicCreated ? 'I suggested a brainstorm topic for review. ' : ''}${created ? `I added ${created} editable idea draft${created === 1 ? '' : 's'} to Brainstorm for review.` : ''}${researchNote} Review the topic and ideas in Brainstorm; only your approval changes the board.`
        : `I couldn’t find a distinct new topic or idea to add.${researchNote}`,
    );
    return;
  }

  let analysis;
  let ideas: IdeaProposal[] = [];
  let reply = '';
  try {
    if (ai.runMention) {
      const result = await ai.runMention({ messages: conversation, files, lookup: projectLookup(projectId, members) });
      analysis = result;
      ideas = result.ideas;
      reply = result.reply;
    } else {
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
    }
  } catch (error) {
    console.error('AI analysis failed', error);
    await say('I couldn’t reach the AI model just now, so nothing was suggested. Please try again in a moment.');
    return;
  }

  // The thread now includes older turns, so a mention must not file the same decision, risk, or task again.
  const waiting = pending.filter((s) => s.status === 'pending');
  const seenDecisions = new Set(
    [
      ...waiting.filter((s) => s.kind === 'decision').map((s) => s.proposal?.toLowerCase()),
      ...decisions.map((d) => d.title.toLowerCase()),
    ].filter((topic): topic is string => Boolean(topic)),
  );
  const seenRisks = new Set(waiting.filter((s) => s.kind === 'risk').map((s) => s.taskId));
  const seenIdeas = new Set(
    waiting
      .filter((s) => s.kind === 'idea')
      .flatMap((s) => [s.ideaDraft?.title, s.title])
      .filter((title): title is string => Boolean(title))
      .map((title) => title.toLowerCase()),
  );

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
      ...citeFor(d.quote, recent, conversation, channelName, files),
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
      ...citeFor(r.quote, recent, conversation, channelName, files),
    });
    panelCount++;
  }
  for (const idea of ideas) {
    const key = idea.title.toLowerCase();
    if (seenIdeas.has(key) || seenIdeas.has(`new idea: ${key}`)) continue;
    await createSuggestion(projectId, {
      kind: 'idea',
      title: `New idea: ${idea.title}`,
      reason: idea.reason,
      quote: idea.quote,
      ideaDraft: { title: idea.title, description: idea.description, theme: idea.theme },
      ...citeFor(idea.quote, recent, conversation, channelName, files),
    });
    panelCount++;
  }

  const items = unseenActionItems(analysis.actionItems, pending);
  if (!reply.trim() && ai.isMock && !items.length) reply = await mockMentionReply(ai, recent, decisions, members);
  const text = mentionReply(reply, panelCount, items.length, ai.isMock);
  if (!items.length) {
    await say(text);
    return;
  }

  const suggestion = await createSuggestion(projectId, {
    kind: 'action_items',
    title: `${items.length} action item${items.length === 1 ? '' : 's'} from the conversation`,
    reason: 'A team member asked the AI to turn the recent discussion into tasks.',
    items,
  });
  await say(text, suggestion.id);
}

function projectLookup(projectId: string, members: Map<string, Member>): ProjectLookup {
  const nameOf = (authorId: string) => members.get(authorId)?.name ?? (authorId === AI_AUTHOR ? 'AI' : 'Unknown');
  return {
    async listMembers() {
      return [...members.values()].map((member) => ({ id: member.id, name: member.name, role: member.role }));
    },
    async listTasks(filter) {
      const status = TASK_STATUSES.find((item) => item === filter.status);
      const tasks = await listTasks(projectId);
      return tasks
        .filter((task) => (!status || task.status === status) && (!filter.assigneeId || task.assigneeId === filter.assigneeId))
        .map((task) => ({
          id: task.id,
          num: task.num,
          title: task.title,
          status: task.status,
          priority: task.priority,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
        }));
    },
    async searchMessages(query) {
      const hits = await searchMessages(projectId, query);
      return hits.map((message) => ({ id: message.id, authorName: nameOf(message.authorId), text: message.text }));
    },
    async listDecisions() {
      const decisions = await listDecisions(projectId);
      return decisions.slice(0, 30).map((decision) => ({
        id: decision.id,
        title: decision.title,
        status: decision.status,
        outcome: decision.outcome,
      }));
    },
    async listPendingSuggestions() {
      const suggestions = await listSuggestions(projectId);
      return suggestions
        .filter((suggestion) => suggestion.status === 'pending')
        .slice(0, 30)
        .map((suggestion) => ({
          kind: suggestion.kind,
          title: suggestion.title,
          proposal: suggestion.proposal,
          taskId: suggestion.taskId,
          ideaTitle: suggestion.ideaDraft?.title ?? null,
        }));
    },
    async listIdeas() {
      const ideas = await listIdeas(projectId);
      return ideas.map((idea) => ({ id: idea.id, title: idea.title }));
    },
  };
}
