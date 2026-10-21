import type { ActionItem, Decision } from '@project-room/shared';
import type { AiProvider, ConversationMessage, MemoryAnswerDraft, ProposedDecision } from './provider.js';

// Rule-based stand-in for a model: phrase matching only. It never calls an external service.
// It is used only when ANTHROPIC_API_KEY is missing, and the UI labels it as mock.

const URGENT = /\b(friday|deadline|due|tonight|tomorrow|asap|urgent)\b/i;
const COMMITMENT =
  /\b(?:i'll|i will|i can|i'm going to|let me)\s+(work on|handle|take care of|build|set up|write|design|fix|do)\s+(?:the\s+)?(.+?)(?:[.!?,]|$)/i;
const UNDECIDED = /\b(?:haven't|have not|didn't|did not)\s+decided?\s+(.+?)(?:[.!?,]|\band\b|$)/i;
const OPEN_NEED = /\b(?:we need to|we still need to|someone needs to|someone should|nobody has)\s+(.+?)(?:[.!?,]|$)/i;
const SHOULD_WE = /\bshould we\s+(.+?)(?:[?.!]|$)/i;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function sentences(messages: ConversationMessage[]) {
  return messages.flatMap((m) =>
    m.text
      .replace(/@\w+/g, '')
      .split(/(?<=[.!?])\s+/)
      .map((text) => ({ authorId: m.authorId, authorName: m.authorName, text: text.trim() }))
      .filter((s) => s.text),
  );
}

export function extractActionItemsByRules(messages: ConversationMessage[], existingTaskTitles: string[]): ActionItem[] {
  const items: ActionItem[] = [];
  for (const { authorId, authorName, text } of sentences(messages)) {
    const priority = URGENT.test(text) ? 'high' : 'medium';
    const base = { priority, include: true, quote: text } as const;
    let match = text.match(COMMITMENT);
    if (match?.[1] && match[2]) {
      items.push({
        ...base,
        title: capitalize(`${match[1]} ${match[2]}`),
        assigneeId: authorId,
        reason: `${authorName} committed to this in chat, so it is proposed with them as owner.`,
      });
      continue;
    }
    match = text.match(UNDECIDED);
    if (match?.[1]) {
      items.push({ ...base, title: `Decide ${match[1].trim()}`, assigneeId: null, reason: 'Someone said this is still undecided.' });
      continue;
    }
    match = text.match(OPEN_NEED);
    if (match?.[1]) {
      items.push({
        ...base,
        title: capitalize(match[1].trim()),
        assigneeId: null,
        reason: 'Someone said this still needs doing and has no owner.',
      });
    }
  }
  const seen = new Set(existingTaskTitles.map((t) => t.toLowerCase()));
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function detectOpenQuestionByRules(text: string): { topic: string } | null {
  const match = text.match(UNDECIDED) ?? text.match(SHOULD_WE);
  return match?.[1] ? { topic: match[1].trim() } : null;
}

function openQuestionProposal(message: ConversationMessage): ProposedDecision | null {
  const question = detectOpenQuestionByRules(message.text);
  if (!question) return null;
  return {
    topic: capitalize(question.topic),
    outcome: null,
    reason: 'This sounds like a choice the team hasn’t settled. Logging it keeps it visible until someone decides.',
    quote: message.text,
  };
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'we',
  'did',
  'do',
  'why',
  'what',
  'which',
  'how',
  'is',
  'are',
  'was',
  'for',
  'our',
  'use',
  'pick',
]);
const words = (text: string) =>
  text
    .toLowerCase()
    .match(/[a-z0-9+.#-]{2,}/g)
    ?.filter((w) => !STOP_WORDS.has(w)) ?? [];

/** Ranks approved decisions by how many question words they share. Plain keyword overlap, no model. */
export function answerFromDecisionsByRules(question: string, decisions: Decision[]): MemoryAnswerDraft {
  const wanted = new Set(words(question));
  const scored = decisions
    .map((d) => {
      const text = new Set(words([d.title, d.outcome, d.reason].filter(Boolean).join(' ')));
      return { decision: d, score: [...wanted].filter((w) => text.has(w)).length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  if (!scored.length) return { answer: 'No approved decision covers that yet.', sourceDecisionIds: [] };
  const lines = scored.map(({ decision: d }) => `• ${d.outcome ?? d.title}${d.reason ? ` — ${d.reason}` : ''}`);
  return { answer: `Closest approved decisions:\n${lines.join('\n')}`, sourceDecisionIds: scored.map((s) => s.decision.id) };
}

export const mockProvider: AiProvider = {
  name: 'mock',
  isMock: true,
  async analyzeConversation({ messages, tasks }) {
    return {
      actionItems: extractActionItemsByRules(
        messages,
        tasks.map((t) => t.title),
      ),
      decisions: [],
      risks: [],
    };
  },
  async detectOpenQuestion(message) {
    return openQuestionProposal(message);
  },
  async answerFromDecisions({ question, decisions }) {
    return answerFromDecisionsByRules(question, decisions);
  },
};
