import {
  IDEA_THEMES,
  PRIORITIES,
  type ActionItem,
  type IdeaDraft,
  type IdeaTheme,
  type MeetingSummary,
  type PollDraft,
  type Priority,
  type SuggestionStatus,
} from '@project-room/shared';
import { mockMeetingAi } from './mock-meeting.js';
import type { FileExcerpt } from './provider.js';
import { providerName, routedModels, type RoutedModel } from './routing.js';
import { createStructuredMeetingAi } from './structured-meeting.js';
import type { MemberBrief } from './provider.js';

// Live AI during a meeting. Like AiProvider, everything returned is a proposal; the caller stores it as a
// suggestion. validateTick is the one place that checks model output against the meeting's real data.

export interface MeetingTickInput {
  lines: { id: string; speakerId: string; speakerName: string; text: string }[];
  runningSummary: string;
  carryOver: string[];
  ideas: { id: string; title: string }[];
  currentTopic?: { id: string; title: string } | null;
  taskTitles: string[];
  /** Titles of suggestions already made, so the AI doesn't repeat them. */
  alreadySuggested: string[];
  members: MemberBrief[];
  /** Passages from files shared in the meeting chat, found by Agent Memory. Empty when none were shared. */
  files?: FileExcerpt[];
}

export interface MeetingTickResult {
  topic?: MeetingTopic | null;
  actionItems: (ActionItem & { sourceLineId: string | null })[];
  /** ideaId is set when the AI proposes developing an existing idea, null for a new one. */
  ideas: { ideaId: string | null; draft: IdeaDraft; reason: string; quote: string | null; sourceLineId: string | null }[];
  polls: { draft: PollDraft; reason: string; quote: string | null; sourceLineId: string | null }[];
  runningSummary: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface SummarizeInput {
  lines: MeetingTickInput['lines'];
  carryOver: string[];
  ideas: { id: string; title: string }[];
  currentTopic?: { id: string; title: string } | null;
  taskTitles: string[];
  suggestions: { title: string; status: SuggestionStatus }[];
  members: MemberBrief[];
}

export interface SummarizeResult {
  topic?: MeetingTopic | null;
  summary: MeetingSummary;
  actionItems: ActionItem[];
  carryOverItems: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface MeetingAi {
  readonly name: string;
  readonly isMock: boolean;
  meetingTick(input: MeetingTickInput): Promise<MeetingTickResult>;
  summarizeMeeting(input: SummarizeInput): Promise<SummarizeResult>;
}

export interface MeetingTopic {
  title: string;
  description: string;
  reason: string;
  quote: string | null;
  sourceLineId: string | null;
}

/** What a provider hands to validateTick: loosely typed, nothing trusted yet. */
export interface RawTick {
  topic?: { title: string; description: string; reason: string; quote: string | null } | null;
  actionItems: { title: string; assigneeId: string | null; priority: string; reason: string; quote: string | null }[];
  ideas: { ideaId: string | null; title: string; description: string; theme: string; reason: string; quote: string | null }[];
  polls: { question: string; options: string[]; reason: string; quote: string | null }[];
  runningSummary: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** What a provider hands to validateSummary: loosely typed, nothing trusted yet. */
export interface RawSummary {
  topic?: RawTick['topic'];
  summary: MeetingSummary;
  actionItems: RawTick['actionItems'];
  carryOverItems: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

const norm = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
const toPriority = (value: string): Priority => PRIORITIES.find((p) => p === value.trim().toLowerCase()) ?? 'medium';
const toTheme = (value: string): IdeaTheme => IDEA_THEMES.find((t) => t.toLowerCase() === value.trim().toLowerCase()) ?? 'Product';
const PREFIXES = /^(new idea|develop|poll|brainstorm topic):\s*/i;
const MAX_SUMMARY_WORDS = 150;

export function validateTick(raw: RawTick, input: MeetingTickInput): MeetingTickResult {
  const memberIds = new Set(input.members.map((m) => m.id));
  const ideaIds = new Set(input.ideas.map((i) => i.id));
  const seen = new Set(input.alreadySuggested.map((s) => norm(s.replace(PREFIXES, ''))));
  /** True the first time a non-empty title is seen; repeats and already-suggested titles are dropped. */
  const fresh = (title: string) => {
    const key = norm(title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  /** A quote is only kept if it appears verbatim in a line; that line becomes the source. */
  const cite = (quote: string | null) => {
    const wanted = quote ? norm(quote.replace(/^["“]|["”]$/g, '')) : '';
    const line = wanted ? input.lines.find((l) => norm(l.text).includes(wanted)) : undefined;
    return line ? { quote: quote!.trim().slice(0, 600), sourceLineId: line.id } : { quote: null, sourceLineId: null };
  };

  return {
    topic:
      raw.topic && fresh(raw.topic.title) && norm(raw.topic.title) !== norm(input.currentTopic?.title ?? '')
        ? {
            title: raw.topic.title.trim().slice(0, 80),
            description: raw.topic.description.trim().slice(0, 240),
            reason: raw.topic.reason.trim().slice(0, 400),
            ...cite(raw.topic.quote),
          }
        : null,
    actionItems: raw.actionItems
      .filter((i) => fresh(i.title))
      .map((i) => ({
        title: i.title.trim().slice(0, 120),
        assigneeId: i.assigneeId && memberIds.has(i.assigneeId) ? i.assigneeId : null,
        priority: toPriority(i.priority),
        include: true,
        reason: i.reason.slice(0, 400),
        ...cite(i.quote),
      })),
    ideas: raw.ideas
      .filter((i) => (!i.ideaId || ideaIds.has(i.ideaId)) && fresh(i.title))
      .map((i) => ({
        ideaId: i.ideaId,
        draft: { title: i.title.trim().slice(0, 80), description: i.description.slice(0, 2000), theme: toTheme(i.theme) },
        reason: i.reason.slice(0, 400),
        ...cite(i.quote),
      })),
    polls: raw.polls
      .map((p) => ({ ...p, options: p.options.map((o) => o.trim().slice(0, 80)) }))
      .filter((p) => p.options.length >= 2 && p.options.length <= 5 && p.options.every(Boolean) && fresh(p.question))
      .map((p) => ({
        draft: { question: p.question.trim().slice(0, 160), options: p.options },
        reason: p.reason.slice(0, 400),
        ...cite(p.quote),
      })),
    runningSummary: raw.runningSummary.trim().split(/\s+/).slice(0, MAX_SUMMARY_WORDS).join(' '),
    usage: raw.usage ?? { inputTokens: 0, outputTokens: 0 },
  };
}

const MAX_OVERVIEW_WORDS = 120;
const capList = (items: string[], max: number, length = 300) =>
  items
    .map((s) => s.trim().slice(0, length))
    .filter(Boolean)
    .slice(0, max);

export function validateSummary(raw: RawSummary, input: SummarizeInput): SummarizeResult {
  const memberIds = new Set(input.members.map((m) => m.id));
  const seen = new Set(input.suggestions.map((s) => norm(s.title.replace(PREFIXES, ''))));
  const cite = (quote: string | null) => {
    const wanted = quote ? norm(quote.replace(/^["“]|["”]$/g, '')) : '';
    return wanted && input.lines.some((l) => norm(l.text).includes(wanted)) ? quote!.trim().slice(0, 600) : null;
  };
  const { summary } = raw;
  return {
    topic:
      raw.topic &&
      norm(raw.topic.title) &&
      norm(raw.topic.title) !== norm(input.currentTopic?.title ?? '') &&
      !seen.has(norm(raw.topic.title))
        ? {
            title: raw.topic.title.trim().slice(0, 80),
            description: raw.topic.description.trim().slice(0, 240),
            reason: raw.topic.reason.trim().slice(0, 400),
            quote: cite(raw.topic.quote),
            sourceLineId:
              input.lines.find((line) => raw.topic?.quote && norm(line.text).includes(norm(raw.topic.quote.replace(/^["“]|["”]$/g, ''))))
                ?.id ?? null,
          }
        : null,
    summary: {
      overview: summary.overview.trim().split(/\s+/).slice(0, MAX_OVERVIEW_WORDS).join(' '),
      decisions: capList(summary.decisions, 10),
      openQuestions: capList(summary.openQuestions, 10),
      nextSteps: capList(summary.nextSteps, 10),
    },
    actionItems: raw.actionItems
      .filter((i) => {
        const key = norm(i.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((i) => ({
        title: i.title.trim().slice(0, 120),
        assigneeId: i.assigneeId && memberIds.has(i.assigneeId) ? i.assigneeId : null,
        priority: toPriority(i.priority),
        include: true,
        reason: i.reason.slice(0, 400),
        quote: cite(i.quote),
      })),
    carryOverItems: capList(raw.carryOverItems, 10, 120),
    usage: raw.usage ?? { inputTokens: 0, outputTokens: 0 },
  };
}

// Same hosts as getAiProvider: Nebius for live ticks, OpenAI for the end summary, otherwise the mock.
let meetingAi: MeetingAi | null = null;

export function composeMeetingAi(heavy: RoutedModel, frequent: RoutedModel): MeetingAi {
  const name = providerName(heavy, frequent);
  if (frequent.client === heavy.client) {
    return { ...createStructuredMeetingAi(heavy.client, frequent.fastModel, heavy.model), name };
  }
  const live = createStructuredMeetingAi(frequent.client, frequent.model, frequent.model);
  const summary = createStructuredMeetingAi(heavy.client, heavy.model, heavy.model);
  return {
    name,
    isMock: false,
    meetingTick: (input) => live.meetingTick(input),
    summarizeMeeting: (input) => summary.summarizeMeeting(input),
  };
}

function pick(): MeetingAi {
  const hosts = routedModels();
  if (!hosts) return mockMeetingAi;
  return composeMeetingAi(hosts.heavy, hosts.frequent);
}

export function getMeetingAi(): MeetingAi {
  meetingAi ??= pick();
  return meetingAi;
}
