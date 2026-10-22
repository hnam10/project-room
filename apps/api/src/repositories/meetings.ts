import type { Meeting, MeetingSummary } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { NotFoundError, rid } from '../db/records.js';

export async function getMeeting(projectId: string, meetingId: string): Promise<Meeting> {
  const meeting = await queryOne<Meeting>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('meeting', meetingId),
    project: rid('project', projectId),
  });
  if (!meeting) throw new NotFoundError('Meeting');
  return meeting;
}

export function listMeetings(projectId: string, limit = 20): Promise<Meeting[]> {
  return queryMany<Meeting>('SELECT * FROM meeting WHERE projectId = $project ORDER BY startedAt DESC LIMIT $limit', {
    project: rid('project', projectId),
    limit,
  });
}

export async function findLiveMeeting(projectId: string): Promise<Meeting | null> {
  const [meeting] = await queryMany<Meeting>("SELECT * FROM meeting WHERE projectId = $project AND status = 'live' LIMIT 1", {
    project: rid('project', projectId),
  });
  return meeting ?? null;
}

export function listExpiredLiveMeetings(now: Date): Promise<Meeting[]> {
  return queryMany<Meeting>("SELECT * FROM meeting WHERE status = 'live' AND endsAt <= $now", { now });
}

export async function createMeeting(input: {
  projectId: string;
  startedById: string;
  title: string;
  language: string;
  previousMeetingId: string | null;
}): Promise<Meeting> {
  const meeting = await queryOne<Meeting>('CREATE ONLY meeting CONTENT $content', {
    content: {
      projectId: rid('project', input.projectId),
      title: input.title,
      status: 'live',
      language: input.language,
      startedById: rid('member', input.startedById),
      participantIds: [rid('member', input.startedById)],
      attendeeIds: [rid('member', input.startedById)],
      previousMeetingId: input.previousMeetingId ? rid('meeting', input.previousMeetingId) : null,
    },
  });
  if (!meeting) throw new Error('Meeting creation returned nothing');
  return meeting;
}

async function update(meetingId: string, set: string, vars: Record<string, unknown> = {}): Promise<Meeting> {
  const meeting = await queryOne<Meeting>(`UPDATE ONLY $id SET ${set} RETURN AFTER`, { id: rid('meeting', meetingId), ...vars });
  if (!meeting) throw new NotFoundError('Meeting');
  return meeting;
}

/** Idempotent: joining twice leaves one entry. */
export function addParticipant(meetingId: string, memberId: string): Promise<Meeting> {
  const member = [rid('member', memberId)];
  return update(meetingId, 'participantIds = array::union(participantIds, $m), attendeeIds = array::union(attendeeIds, $m)', { m: member });
}

export function removeParticipant(meetingId: string, memberId: string): Promise<Meeting> {
  return update(meetingId, 'participantIds = array::complement(participantIds, $m)', { m: [rid('member', memberId)] });
}

/** live -> summarizing, guarded in the DB so a sweep and a manual end can't both win. Null when it lost the race. */
export async function beginSummarizing(meetingId: string): Promise<Meeting | null> {
  const [meeting] = await queryMany<Meeting>(
    "UPDATE $id SET status = 'summarizing', endedAt = time::now(), participantIds = [] WHERE status = 'live' RETURN AFTER",
    { id: rid('meeting', meetingId) },
  );
  return meeting ?? null;
}

/** ended with a failed summary -> summarizing again. Null when the meeting isn't in that state. */
export async function restartSummarizing(meetingId: string): Promise<Meeting | null> {
  const [meeting] = await queryMany<Meeting>(
    "UPDATE $id SET status = 'summarizing', summaryError = NULL WHERE status = 'ended' AND summaryError != NULL RETURN AFTER",
    { id: rid('meeting', meetingId) },
  );
  return meeting ?? null;
}

export function listSummarizingMeetings(): Promise<Meeting[]> {
  return queryMany<Meeting>("SELECT * FROM meeting WHERE status = 'summarizing'");
}

/** One UPDATE: stores the summary, adds the call's usage and ends the meeting. */
export function finishSummary(
  meetingId: string,
  summary: MeetingSummary,
  usage: { inputTokens: number; outputTokens: number },
): Promise<Meeting> {
  return update(
    meetingId,
    `summary = $summary, status = 'ended', endedAt = endedAt ?? time::now(), summaryError = NULL,
     usage.calls += 1, usage.inputTokens += $input, usage.outputTokens += $output`,
    { summary, input: usage.inputTokens, output: usage.outputTokens },
  );
}

export function failSummary(meetingId: string, message: string): Promise<Meeting> {
  return update(meetingId, "status = 'ended', endedAt = endedAt ?? time::now(), summaryError = $message", {
    message: message.slice(0, 300),
  });
}

export function setCarryOver(meetingId: string, carryOver: string[]): Promise<Meeting> {
  return update(meetingId, 'carryOver = $carryOver', { carryOver });
}

/** The newest ended meeting whose confirmed notes the next meeting continues from. */
export async function findLatestWithCarryOver(projectId: string): Promise<Meeting | null> {
  const [meeting] = await queryMany<Meeting>(
    "SELECT * FROM meeting WHERE projectId = $project AND status = 'ended' AND array::len(carryOver) > 0 ORDER BY startedAt DESC LIMIT 1",
    { project: rid('project', projectId) },
  );
  return meeting ?? null;
}

export function setAiEnabled(meetingId: string, enabled: boolean): Promise<Meeting> {
  return update(meetingId, 'aiEnabled = $enabled', { enabled });
}

/** Moves the AI cursor and adds this tick's usage in one atomic UPDATE. */
export function recordTick(
  meetingId: string,
  tick: { aiCursor: string | null; runningSummary: string; usageDelta: { calls: number; inputTokens: number; outputTokens: number } },
): Promise<Meeting> {
  const { calls, inputTokens, outputTokens } = tick.usageDelta;
  return update(
    meetingId,
    `aiCursor = $cursor, runningSummary = $summary,
     usage.calls += $calls, usage.inputTokens += $input, usage.outputTokens += $output`,
    {
      cursor: tick.aiCursor ? rid('transcript_line', tick.aiCursor) : null,
      summary: tick.runningSummary,
      calls,
      input: inputTokens,
      output: outputTokens,
    },
  );
}
