import type { Meeting } from '@project-room/shared';
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

export function markEnded(meetingId: string): Promise<Meeting> {
  return update(meetingId, "status = 'ended', endedAt = time::now(), participantIds = []");
}
