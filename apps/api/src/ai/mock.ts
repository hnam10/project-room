import type { ActionItem } from '@project-room/shared';
import type { AiProvider, ConversationMessage } from './provider.js';
import { mockStrategy } from './mock-strategy.js';

const PRODUCT_CUES =
  /\b(app|application|product|platform|software|website|marketplace|dashboard|tracker|calendar|reminder|tool|device|service|prototype)\b|앱|제품|플랫폼|서비스|도구|웹사이트/i;
const NON_PRODUCT_CUES =
  /\b(event|campaign|workshop|activity|festival|policy|process|lesson|club|community|fundraiser|competition|story|topic)\b|행사|캠페인|활동|정책|수업|동아리/i;
const MEAL_CUES = /\b(dinner|lunch|breakfast|meal|cuisine)\b|저녁|점심|아침|음식/i;

function mealOption(existingTitles: string[]) {
  return ['Italian food', 'Korean food', 'Mexican food'].find(
    (title) => !existingTitles.some((existing) => existing.trim().toLowerCase() === title.toLowerCase()),
  );
}

// Rule-based stand-in for a model: phrase matching only. It never calls an external service.
// It is used only when OPENAI_API_KEY is missing, and the UI labels it as mock.

const URGENT = /\b(friday|deadline|due|tonight|tomorrow|asap|urgent)\b/i;
const COMMITMENT =
  /\b(?:i'll|i will|i can|i'm going to|let me)\s+(work on|handle|take care of|build|set up|write|design|fix|do)\s+(?:the\s+)?(.+?)(?:[.!?,]|$)/i;
const UNDECIDED = /\b(?:haven't|have not|didn't|did not)\s+decided?\s+(.+?)(?:[.!?,]|\band\b|$)/i;
const OPEN_NEED = /\b(?:we need to|we still need to|someone needs to|someone should|nobody has)\s+(.+?)(?:[.!?,]|$)/i;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function mockBrainstormTopic(messages: ConversationMessage[]) {
  const clean = (text: string) =>
    text
      .replace(/@ai\b/gi, '')
      .replace(/^\s*(?:please\s+)?(?:can you\s+)?(?:brainstorm|ideate|suggest ideas?)(?:\s+(?:about|for))?\s*/i, '')
      .trim();
  const candidate = [...messages].reverse().find((message) => {
    const title = clean(message.text);
    return title.length >= 8 && !/^(?:this|that|it|some ideas|ideas)(?:[?.!]*)$/i.test(title);
  });
  if (!candidate) return null;
  return {
    title: capitalize(clean(candidate.text)).slice(0, 80),
    description: '',
    reason: 'The team raised this as the current brainstorming topic in chat.',
    quote: candidate.text,
  };
}

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

export const mockProvider: AiProvider = {
  name: 'mock',
  isMock: true,
  async interpretChatIntent() {
    return null;
  },
  async classifyBrainstorm({ problem, ideas, request }) {
    const focus = request?.replace(/@ai\b|brainstorm|ideas?|suggest|ways to/gi, '').trim();
    const text =
      focus ||
      `${problem?.title ?? ''} ${problem?.description ?? ''}`.trim() ||
      ideas.map((idea) => `${idea.title} ${idea.description}`).join(' ');
    if (text.trim().length < 12) return 'unclear';
    if (PRODUCT_CUES.test(text)) return 'product';
    if (MEAL_CUES.test(text)) return 'non_product';
    if (NON_PRODUCT_CUES.test(text)) return 'non_product';
    if (!focus && ideas.some((idea) => PRODUCT_CUES.test(`${idea.title} ${idea.description}`))) return 'product';
    if (text.trim().split(/\s+/).length >= 3) return 'non_product';
    return 'unclear';
  },
  async analyzeConversation({ messages, tasks }) {
    return {
      actionItems: extractActionItemsByRules(
        messages,
        tasks.map((t) => t.title),
      ),
      risks: [],
    };
  },
  async brainstorm({ messages, existingIdeas, research, mode = 'product' }) {
    const proposedTopic = mockBrainstormTopic(messages);
    const request = messages
      .at(-1)
      ?.text.replace(/@ai\b/gi, '')
      .replace(/\b(brainstorm|research|ideas?|suggest)\b/gi, '')
      .trim();
    const topic =
      request && !/^(?:this|that|it)[?.!]*$/i.test(request) ? request : (proposedTopic?.title ?? 'the team’s current challenge');
    if (mode === 'non_product' && MEAL_CUES.test(topic)) {
      const choice = mealOption(existingIdeas.map((idea) => idea.title));
      return {
        topic: proposedTopic,
        ideas: choice
          ? [
              {
                draft: {
                  title: choice,
                  description: `Try ${choice.toLowerCase()} for the meal, then check everyone's dietary preferences.`,
                  theme: 'Option' as const,
                },
                reason: 'This is a concrete food option for the team to consider.',
                quote: messages.at(-1)?.text ?? null,
                sourceUrls: [],
              },
            ]
          : [],
      };
    }
    const title = `${mode === 'non_product' ? 'Strategy' : 'Prototype'}: ${capitalize(topic)}`.slice(0, 80);
    return {
      topic: proposedTopic,
      ideas: existingIdeas.some((idea) => idea.title.toLowerCase() === title.toLowerCase())
        ? []
        : [
            {
              draft: {
                title,
                description:
                  mode === 'non_product'
                    ? `Try a focused approach to ${topic}, then discuss what worked and what to change with the team.`
                    : `Build the smallest testable version of ${topic}, then collect feedback from the team’s target users.`,
                theme: mode === 'non_product' ? ('Strategy' as const) : ('Product' as const),
              },
              reason:
                research.length && mode === 'product'
                  ? 'This turns the team’s request and the available web research into a testable next direction.'
                  : 'This turns the team’s request into a testable next direction.',
              quote: messages.at(-1)?.text ?? null,
              sourceUrls: mode === 'product' && research[0] ? [research[0].url] : [],
            },
          ],
    };
  },
  async summarizeResearch({ idea, results }) {
    return results.map((result) => ({
      url: result.url,
      title: result.title.split(/[:|–]/)[0]!.trim().slice(0, 60),
      summary: `“${result.title}” is a related approach to “${idea.title}”. Check the source for its specific features and audience.`,
    }));
  },
  async facilitateBrainstorm({ trigger, problem, ideas, research, mode = 'product' }) {
    const titles = ideas.map((idea) => idea.title);
    const summary: Record<typeof trigger, string> = {
      problem_created: mockStrategy(problem, mode).recommendation,
      first_idea: research.length
        ? `Review these search results for similar solutions to “${titles[0]}”. Check what each source actually says before drawing a conclusion.`
        : `Research existing solutions to “${titles[0]}”. Web research is not configured, so no market claims are available.`,
      multiple_ideas: `Compare ${titles.slice(0, 3).join(', ')} for shared users, overlapping features, and ways they could combine.`,
      research_completed: `Review the attached sources and identify one feature or audience assumption worth improving.`,
      idea_updated: `This idea changed meaningfully. Recheck its target audience, key assumptions, and any earlier research before relying on old suggestions.`,
      discussion_inactive: `Choose one next step: clarify the problem, test an assumption with users, or shortlist an idea.`,
      ideas_shortlisted: `Compare ${titles.filter(Boolean).slice(0, 3).join(', ')} on user value, feasibility, effort, and risk. This mock cannot score them reliably.`,
      idea_approved: `Define the smallest useful version of “${titles[0]}” and review the proposed tasks before adding them.`,
      manual: `Discuss the strongest assumption behind the current idea and what evidence would test it.`,
    };
    const focus = trigger === 'problem_created' ? problem?.title : (ideas[0]?.title ?? problem?.title);
    const meal = mode === 'non_product' && MEAL_CUES.test(`${problem?.title ?? ''} ${focus ?? ''}`);
    const choice = meal ? mealOption(titles) : null;
    const direction =
      focus && (trigger === 'problem_created' || trigger === 'first_idea' || trigger === 'idea_updated' || trigger === 'manual')
        ? {
            draft: {
              title: choice ?? `${mode === 'non_product' ? 'Strategy' : 'Concept'}: ${focus}`.slice(0, 80),
              description: choice
                ? `Try ${choice.toLowerCase()} for the meal, then check everyone's dietary preferences.`
                : mode === 'non_product'
                  ? `Try one concrete approach to ${focus}, then discuss its outcome with the team.`
                  : `Explore a focused product concept that addresses ${focus} and test it with the intended users.`,
              theme: choice ? ('Option' as const) : mode === 'non_product' ? ('Strategy' as const) : ('Product' as const),
            },
            reason: choice
              ? 'This gives the team a specific meal option to consider.'
              : `This direction follows the team's ${problem ? 'central problem' : 'existing idea'}: “${focus}”.`,
            quote: null,
            sourceUrls: [],
          }
        : null;
    return {
      summary: summary[trigger] ?? '',
      ...(trigger === 'problem_created' ? { strategy: mockStrategy(problem, mode) } : {}),
      ideas: direction ? [direction] : [],
      tasks:
        trigger === 'idea_approved' && titles[0]
          ? [
              {
                title: `${mode === 'non_product' ? 'Define the first step' : 'Define MVP scope'} for ${titles[0]}`.slice(0, 120),
                assigneeId: null,
                priority: 'medium',
                include: true,
                reason: 'An approved direction needs a small, reviewable scope.',
                quote: null,
              },
              {
                title: `${mode === 'non_product' ? 'Try the strategy' : 'Build a testable prototype'} of ${titles[0]}`.slice(0, 120),
                assigneeId: null,
                priority: 'medium',
                include: true,
                reason:
                  mode === 'non_product'
                    ? 'A small trial can show whether the strategy helps.'
                    : 'A prototype can validate the approved idea.',
                quote: null,
              },
            ]
          : [],
    };
  },
};
