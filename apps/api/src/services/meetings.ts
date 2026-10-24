import type { Meeting, MeetingCreateInput, TranscriptLine, TranscriptSource } from '@project-room/shared';
import { ConflictError, ForbiddenError } from '../db/records.js';
import {
  addParticipant,
  createMeeting,
  findLiveMeeting,
  getMeeting,
  beginSummarizing,
  findLatestWithCarryOver,
  listExpiredLiveMeetings,
  restartSummarizing,
  removeParticipant,
} from '../repositories/meetings.js';
import { createLine } from '../repositories/transcripts.js';
import type { MeetingAi } from '../ai/meeting.js';
import { transcribe } from '../ai/transcribe.js';
import { summarize } from './meeting-summary.js';

type LineListener = (meeting: Meeting, line: TranscriptLine) => void;
const lineListeners: LineListener[] = [];

/** Registers a callback run after each transcript line is stored (the live AI hooks in here). */
export function onLine(listener: LineListener): void {
  lineListeners.push(listener);
}

export async function startMeeting(projectId: string, memberId: string, input: MeetingCreateInput): Promise<Meeting> {
  if (await findLiveMeeting(projectId)) throw new ConflictError('A meeting is already live in this project');
  return createMeeting({
    projectId,
    startedById: memberId,
    title: input.title ?? 'Team meeting',
    language: input.language ?? 'en-US',
    previousMeetingId: (await findLatestWithCarryOver(projectId))?.id ?? null,
  });
}

async function liveMeeting(projectId: string, meetingId: string, now = new Date()): Promise<Meeting> {
  const meeting = await getMeeting(projectId, meetingId);
  if (meeting.status !== 'live' || now >= new Date(meeting.endsAt)) throw new ConflictError('This meeting has ended');
  return meeting;
}

export async function joinMeeting(projectId: string, meetingId: string, memberId: string): Promise<Meeting> {
  await liveMeeting(projectId, meetingId);
  return addParticipant(meetingId, memberId);
}

/** Leaving as the last participant ends the meeting, so an empty room never stays live. */
export async function leaveMeeting(projectId: string, meetingId: string, memberId: string): Promise<Meeting> {
  const before = await getMeeting(projectId, meetingId);
  // Only a real departure may end it: a repeat or stray leave during a drop's grace period must not.
  if (!before.participantIds.includes(memberId)) return before;
  const meeting = await removeParticipant(meetingId, memberId);
  return (await endIfEmpty(meeting)) ?? meeting;
}

/**
 * A member's last socket closed (closed tab, refresh, lost network): take them out of the project's live call. If that
 * emptied it, end it after `graceMs` unless someone joined again, so a refresh doesn't end the meeting.
 */
export async function dropFromLiveMeeting(projectId: string, memberId: string, graceMs = DROP_GRACE_MS): Promise<void> {
  const meeting = await findLiveMeeting(projectId);
  if (!meeting?.participantIds.includes(memberId)) return;
  if ((await removeParticipant(meeting.id, memberId)).participantIds.length) return;
  // ponytail: in-process timer; a restart in the window leaves it to the 60-minute clock.
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  await endIfEmpty(await getMeeting(projectId, meeting.id));
}

const DROP_GRACE_MS = 30_000;

/** Ends a live meeting nobody is in and starts its summary; null when it wasn't ended here. */
async function endIfEmpty(meeting: Meeting): Promise<Meeting | null> {
  if (meeting.status !== 'live' || meeting.participantIds.length) return null;
  const summarizing = await beginSummarizing(meeting.id, true); // null: someone joined, or another end won
  if (summarizing) summarizeInBackground(summarizing);
  return summarizing;
}

/** Transcribes one clip of the caller's mic and stores it as their line; null when the clip was silent. */
export async function addAudio(projectId: string, meetingId: string, memberId: string, audio: Buffer, type: string) {
  const meeting = await liveMeeting(projectId, meetingId);
  if (!meeting.participantIds.includes(memberId)) throw new ForbiddenError('Join the meeting to speak in it');
  const text = (await transcribe(audio, type, meeting.language)).slice(0, 1000);
  return text ? addLine(projectId, meetingId, memberId, text) : null;
}

export async function addLine(
  projectId: string,
  meetingId: string,
  memberId: string,
  text: string,
  source: TranscriptSource = 'voice',
): Promise<TranscriptLine> {
  const meeting = await liveMeeting(projectId, meetingId);
  if (!meeting.participantIds.includes(memberId)) throw new ForbiddenError('Join the meeting to speak in it');
  const line = await createLine(projectId, meetingId, memberId, text, source);
  for (const listener of lineListeners) {
    try {
      listener(meeting, line);
    } catch (error) {
      console.error('Transcript line listener failed', error);
    }
  }
  return line;
}

const summarizeInBackground = (meeting: Meeting) =>
  void summarize(meeting.projectId, meeting.id).catch((e) => console.error('Meeting summary failed', e));

/**
 * Ends the call and starts the summary in the background; the caller gets the 'summarizing' meeting.
 * On an ended meeting whose summary failed, it reruns only the summary.
 */
export async function endMeeting(projectId: string, meetingId: string, memberId: string): Promise<Meeting> {
  const meeting = await getMeeting(projectId, meetingId);
  if (meeting.status === 'summarizing') return meeting;
  if (meeting.status === 'ended') {
    if (!meeting.summaryError) throw new ConflictError('This meeting has already ended');
    const again = await restartSummarizing(meetingId);
    if (!again) return getMeeting(projectId, meetingId);
    summarizeInBackground(again);
    return again;
  }
  if (!meeting.participantIds.includes(memberId)) throw new ForbiddenError('Join the meeting to end it');
  const summarizing = await beginSummarizing(meetingId); // null: a concurrent end already won
  if (!summarizing) return getMeeting(projectId, meetingId);
  summarizeInBackground(summarizing);
  return summarizing;
}

/** Ends meetings past their cap and summarizes each; `ai` is for tests. */
export async function endExpiredMeetings(now = new Date(), ai?: MeetingAi): Promise<void> {
  for (const meeting of await listExpiredLiveMeetings(now)) {
    if (await beginSummarizing(meeting.id)) await summarize(meeting.projectId, meeting.id, ai);
  }
}

/** Enforces the 60-minute cap; returns the stop function. */
export function startMeetingClock(): () => void {
  const timer = setInterval(() => void endExpiredMeetings().catch((e) => console.error('Meeting clock failed', e)), 15_000);
  return () => clearInterval(timer);
}
