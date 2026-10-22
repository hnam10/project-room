import type { Meeting, MeetingCreateInput, TranscriptLine } from '@project-room/shared';
import { ConflictError, ForbiddenError } from '../db/records.js';
import {
  addParticipant,
  createMeeting,
  findLiveMeeting,
  getMeeting,
  listExpiredLiveMeetings,
  markEnded,
  removeParticipant,
} from '../repositories/meetings.js';
import { createLine } from '../repositories/transcripts.js';

type LineListener = (meeting: Meeting, line: TranscriptLine) => void;
const lineListeners: LineListener[] = [];

/** Registers a callback run after each transcript line is stored (the live AI hooks in here). */
export function onLine(listener: LineListener): void {
  lineListeners.push(listener);
}

export async function startMeeting(projectId: string, memberId: string, input: MeetingCreateInput): Promise<Meeting> {
  if (await findLiveMeeting(projectId)) throw new ConflictError('A meeting is already live in this project');
  // ponytail: check-then-create can race; add a unique index on live meetings per project if it matters
  return createMeeting({
    projectId,
    startedById: memberId,
    title: input.title ?? 'Team meeting',
    language: input.language ?? 'ko-KR',
    previousMeetingId: null,
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

export async function leaveMeeting(projectId: string, meetingId: string, memberId: string): Promise<Meeting> {
  await getMeeting(projectId, meetingId);
  return removeParticipant(meetingId, memberId);
}

export async function addLine(projectId: string, meetingId: string, memberId: string, text: string): Promise<TranscriptLine> {
  const meeting = await liveMeeting(projectId, meetingId);
  if (!meeting.participantIds.includes(memberId)) throw new ForbiddenError('Join the meeting to speak in it');
  const line = await createLine(projectId, meetingId, memberId, text);
  for (const listener of lineListeners) {
    try {
      listener(meeting, line);
    } catch (error) {
      console.error('Transcript line listener failed', error);
    }
  }
  return line;
}

// Task 10 replaces this with the summarizing flow.
export async function endMeeting(projectId: string, meetingId: string, _memberId: string): Promise<Meeting> {
  const meeting = await getMeeting(projectId, meetingId);
  return meeting.status === 'ended' ? meeting : markEnded(meetingId);
}

export async function endExpiredMeetings(now = new Date()): Promise<void> {
  for (const meeting of await listExpiredLiveMeetings(now)) await markEnded(meeting.id);
}

/** Enforces the 60-minute cap; returns the stop function. */
export function startMeetingClock(): () => void {
  const timer = setInterval(() => void endExpiredMeetings().catch((e) => console.error('Meeting clock failed', e)), 15_000);
  return () => clearInterval(timer);
}
