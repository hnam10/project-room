import type { TranscriptLine, TranscriptSource } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { rid, ridOrNull } from '../db/records.js';

export async function createLine(
  projectId: string,
  meetingId: string,
  speakerId: string,
  text: string,
  source: TranscriptSource = 'voice',
  fileId: string | null = null,
): Promise<TranscriptLine> {
  const line = await queryOne<TranscriptLine>('CREATE ONLY transcript_line CONTENT $content', {
    content: {
      projectId: rid('project', projectId),
      meetingId: rid('meeting', meetingId),
      speakerId: rid('member', speakerId),
      text,
      source,
      fileId: ridOrNull('file', fileId),
    },
  });
  if (!line) throw new Error('Transcript line creation returned nothing');
  return line;
}

export function listLines(projectId: string, meetingId: string): Promise<TranscriptLine[]> {
  return queryMany<TranscriptLine>('SELECT * FROM transcript_line WHERE projectId = $project AND meetingId = $meeting ORDER BY spokenAt', {
    project: rid('project', projectId),
    meeting: rid('meeting', meetingId),
  });
}

/**
 * Lines spoken after the cursor line (all lines when null), oldest first, at most `limit`. The cursor is compared
 * inside the DB: a JS Date would cut spokenAt to milliseconds and re-read the cursor line itself.
 */
export function listLinesAfter(
  projectId: string,
  meetingId: string,
  cursorLineId: string | null,
  limit: number,
): Promise<TranscriptLine[]> {
  return queryMany<TranscriptLine>(
    `SELECT * FROM transcript_line WHERE projectId = $project AND meetingId = $meeting
     ${cursorLineId ? 'AND (spokenAt > $cursor.spokenAt OR (spokenAt = $cursor.spokenAt AND id > $cursor))' : ''}
     ORDER BY spokenAt ASC, id ASC LIMIT $limit`,
    {
      project: rid('project', projectId),
      meeting: rid('meeting', meetingId),
      cursor: cursorLineId ? rid('transcript_line', cursorLineId) : undefined,
      limit,
    },
  );
}

/** Files shared in this meeting's chat, oldest first. */
export async function listMeetingFiles(projectId: string, meetingId: string): Promise<{ fileId: string; name: string }[]> {
  return queryMany<{ fileId: string; name: string }>(
    'SELECT fileId, text AS name, spokenAt FROM transcript_line WHERE projectId = $project AND meetingId = $meeting AND fileId != NULL ORDER BY spokenAt',
    { project: rid('project', projectId), meeting: rid('meeting', meetingId) },
  );
}
