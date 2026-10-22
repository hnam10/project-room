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
import { config } from '../config.js';
import { createAnthropicMeetingAi } from './anthropic-meeting.js';
import { mockMeetingAi } from './mock-meeting.js';
import type { MemberBrief } from './provider.js';

// Live AI during a meeting. Like AiProvider, everything returned is a proposal; the caller stores it as a
// suggestion. validateTick is the one place that checks model output against the meeting's real data.

export interface MeetingTickInput {
  lines: { id: string; speakerId: string; speakerName: string; text: string }[];
  runningSummary: string;
  carryOver: string[];
  ideas: { id: string; title: string }[];
  taskTitles: string[];
  /** Titles of suggestions already made, so the AI doesn't repeat them. */
  alreadySuggested: string[];
  members: MemberBrief[];
}

export interface MeetingTickResult {
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
  taskTitles: string[];
  suggestions: { title: string; status: SuggestionStatus }[];
  members: MemberBrief[];
}

export interface SummarizeResult {
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

/** What a provider hands to validateTick: loosely typed, nothing trusted yet. */
export interface RawTick {
  actionItems: { title: string; assigneeId: string | null; priority: string; reason: string; quote: string | null }[];
  ideas: { ideaId: string | null; title: string; description: string; theme: string; reason: string; quote: string | null }[];
  polls: { question: string; options: string[]; reason: string; quote: string | null }[];
  runningSummary: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** What a provider hands to validateSummary: loosely typed, nothing trusted yet. */
export interface RawSummary {
  summary: MeetingSummary;
  actionItems: RawTick['actionItems'];
  carryOverItems: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

const norm = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
const toPriority = (value: string): Priority => PRIORITIES.find((p) => p === value.trim().toLowerCase()) ?? 'medium';
const toTheme = (value: string): IdeaTheme => IDEA_THEMES.find((t) => t.toLowerCase() === value.trim().toLowerCase()) ?? 'Product';
const PREFIXES = /^(new idea|develop|poll):\s*/i;
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
    return line ? { quote: quote!.trim(), sourceLineId: line.id } : { quote: null, sourceLineId: null };
  };

  return {
    actionItems: raw.actionItems
      .filter((i) => fresh(i.title))
      .map((i) => ({
        title: i.title.trim().slice(0, 120),
        assigneeId: i.assigneeId && memberIds.has(i.assigneeId) ? i.assigneeId : null,
        priority: toPriority(i.priority),
        include: true,
        reason: i.reason,
        ...cite(i.quote),
      })),
    ideas: raw.ideas
      .filter((i) => (!i.ideaId || ideaIds.has(i.ideaId)) && fresh(i.title))
      .map((i) => ({
        ideaId: i.ideaId,
        draft: { title: i.title.trim().slice(0, 80), description: i.description.slice(0, 2000), theme: toTheme(i.theme) },
        reason: i.reason,
        ...cite(i.quote),
      })),
    polls: raw.polls
      .map((p) => ({ ...p, options: p.options.map((o) => o.trim().slice(0, 80)) }))
      .filter((p) => p.options.length >= 2 && p.options.length <= 5 && p.options.every(Boolean) && fresh(p.question))
      .map((p) => ({ draft: { question: p.question.trim().slice(0, 160), options: p.options }, reason: p.reason, ...cite(p.quote) })),
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
    return wanted && input.lines.some((l) => norm(l.text).includes(wanted)) ? quote!.trim() : null;
  };
  const { summary } = raw;
  return {
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
        reason: i.reason,
        quote: cite(i.quote),
      })),
    carryOverItems: capList(raw.carryOverItems, 10, 120),
    usage: raw.usage ?? { inputTokens: 0, outputTokens: 0 },
  };
}

// Claude when ANTHROPIC_API_KEY is set, otherwise the labelled mock.
let meetingAi: MeetingAi | null = null;

export function getMeetingAi(): MeetingAi {
  meetingAi ??=
    config.anthropicApiKey && !config.forceMockAi
      ? createAnthropicMeetingAi(config.anthropicApiKey, config.anthropicFastModel, config.anthropicModel)
      : mockMeetingAi;
  return meetingAi;
}
