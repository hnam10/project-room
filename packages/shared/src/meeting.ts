import { z } from 'zod';
import { IDEA_THEMES, type IdeaTheme } from './domain.js';

// AI Meeting Room: meetings, transcript lines, polls and the WebRTC signalling messages.

export type MeetingStatus = 'live' | 'summarizing' | 'ended';

export interface MeetingSummary {
  overview: string;
  decisions: string[];
  openQuestions: string[];
  nextSteps: string[];
}

export interface MeetingUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Meeting {
  id: string;
  projectId: string;
  title: string;
  status: MeetingStatus;
  /** BCP-47 tag used for speech recognition. */
  language: string;
  startedById: string;
  /** Members currently in the call. */
  participantIds: string[];
  /** Current participants whose microphones are muted. */
  mutedParticipantIds: string[];
  /** Everyone who joined at any point. */
  attendeeIds: string[];
  aiEnabled: boolean;
  startedAt: string;
  endsAt: string;
  endedAt: string | null;
  previousMeetingId: string | null;
  /** Internal context rewritten by each live AI call; not shown as fact. */
  runningSummary: string;
  /** Last transcript line the live AI has read. */
  aiCursor: string | null;
  /** Written at the end; labelled AI in the UI. */
  summary: MeetingSummary | null;
  /** Member-confirmed notes for the next meeting. */
  carryOver: string[];
  usage: MeetingUsage;
  summaryError: string | null;
}

export interface TranscriptLine {
  id: string;
  projectId: string;
  meetingId: string;
  speakerId: string;
  text: string;
  /** 'chat' when typed in the meeting chat; lines saved before chat existed have none and are speech. */
  source?: TranscriptSource;
  /** A file shared in the meeting chat; `text` is its name. */
  fileId?: string | null;
  spokenAt: string;
}

export interface PollOption {
  id: string;
  label: string;
  voterIds: string[];
}

export interface Poll {
  id: string;
  projectId: string;
  meetingId: string | null;
  question: string;
  options: PollOption[];
  status: 'open' | 'closed';
  createdById: string;
  sourceSuggestionId: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface IdeaDraft {
  title: string;
  description: string;
  theme: IdeaTheme;
}

export interface PollDraft {
  question: string;
  options: string[];
}

export interface MeetingDetail {
  meeting: Meeting;
  lines: TranscriptLine[];
  polls: Poll[];
}

export interface RtcSignal {
  kind: 'offer' | 'answer' | 'ice';
  data: unknown;
}

/** Client -> server: relay a WebRTC signal to one participant. */
export interface ClientRtc {
  type: 'rtc';
  meetingId: string;
  to: string;
  signal: RtcSignal;
}

/** Server -> client: a WebRTC signal from another participant. */
export interface ServerRtc {
  type: 'rtc';
  meetingId: string;
  from: string;
  signal: RtcSignal;
}

export const meetingCreateSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  language: z.string().trim().min(1).max(16).default('en-US'),
});
export type MeetingCreateInput = z.input<typeof meetingCreateSchema>;

/** 'ai' lines are @AI replies in the meeting chat; their speakerId is the member who asked. */
export const TRANSCRIPT_SOURCES = ['voice', 'chat', 'ai'] as const;
export type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];
export const transcriptLineCreateSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    source: z.enum(['voice', 'chat']).default('voice'),
    /** A file shared in the meeting chat; the server stores its name as the text. */
    fileId: z.string().min(1).max(64).optional(),
  })
  .refine((line) => !line.fileId || line.source === 'chat', { message: 'Only meeting chat lines can carry a file', path: ['fileId'] });
export const meetingAiSchema = z.object({ enabled: z.boolean() });
export const meetingMuteSchema = z.object({ muted: z.boolean() });
export const pollVoteSchema = z.object({ optionId: z.string().min(1).max(64) });

export const ideaDraftSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().max(2000).default(''),
  theme: z.enum(IDEA_THEMES),
});

export const pollDraftSchema = z.object({
  question: z.string().trim().min(1).max(160),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
});

/** Splits text into chunks of at most `max` chars, cutting at the last space before `max` (hard cut if none). */
export function splitLine(text: string, max = 1000): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf(' ', max);
    const at = cut > 0 ? cut : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}
