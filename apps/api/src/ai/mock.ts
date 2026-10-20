import type { ActionItem } from '@project-room/shared';
import type { AiProvider, ConversationMessage, OpenQuestion } from './provider.js';

// Rule-based stand-in for a model: phrase matching only. It never calls an external service.

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
      .map((text) => ({ authorId: m.authorId, text: text.trim() }))
      .filter((s) => s.text),
  );
}

export function extractActionItemsByRules(messages: ConversationMessage[], existingTaskTitles: string[]): ActionItem[] {
  const items: ActionItem[] = [];
  for (const { authorId, text } of sentences(messages)) {
    const priority = URGENT.test(text) ? 'high' : 'medium';
    let match = text.match(COMMITMENT);
    if (match?.[1] && match[2]) {
      items.push({ title: capitalize(`${match[1]} ${match[2]}`), assigneeId: authorId, priority, include: true });
      continue;
    }
    match = text.match(UNDECIDED);
    if (match?.[1]) {
      items.push({ title: `Decide ${match[1].trim()}`, assigneeId: null, priority, include: true });
      continue;
    }
    match = text.match(OPEN_NEED);
    if (match?.[1]) items.push({ title: capitalize(match[1].trim()), assigneeId: null, priority, include: true });
  }
  const seen = new Set(existingTaskTitles.map((t) => t.toLowerCase()));
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function detectOpenQuestionByRules(text: string): OpenQuestion | null {
  const match = text.match(UNDECIDED) ?? text.match(SHOULD_WE);
  return match?.[1] ? { topic: match[1].trim() } : null;
}

export const mockProvider: AiProvider = {
  name: 'mock',
  isMock: true,
  async extractActionItems({ messages, existingTaskTitles }) {
    return extractActionItemsByRules(messages, existingTaskTitles);
  },
  async detectOpenQuestion(message) {
    return detectOpenQuestionByRules(message.text);
  },
};
