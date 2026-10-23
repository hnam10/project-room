import type { TranscriptLine } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { rid } from '../db/records.js';

export async function createLine(projectId: string, meetingId: string, speakerId: string, text: string): Promise<TranscriptLine> {
  const line = await queryOne<TranscriptLine>('CREATE ONLY transcript_line CONTENT $content', {
    content: { projectId: rid('project', projectId), meetingId: rid('meeting', meetingId), speakerId: rid('member', speakerId), text },
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

/** Lines spoken after the cursor line (all lines when null), oldest first, capped to the newest `limit`. */
export async function listLinesAfter(
  projectId: string,
  meetingId: string,
  cursorLineId: string | null,
  limit: number,
): Promise<TranscriptLine[]> {
  const cursor = cursorLineId
    ? await queryOne<TranscriptLine>('SELECT * FROM ONLY $id', { id: rid('transcript_line', cursorLineId) })
    : null;
  const lines = await queryMany<TranscriptLine>(
    `SELECT * FROM transcript_line WHERE projectId = $project AND meetingId = $meeting ${cursor ? 'AND (spokenAt > $after OR (spokenAt = $after AND id > $afterId))' : ''}
     ORDER BY spokenAt ASC, id ASC LIMIT $limit`,
    {
      project: rid('project', projectId),
      meeting: rid('meeting', meetingId),
      after: cursor ? new Date(cursor.spokenAt) : undefined,
      afterId: cursor ? rid('transcript_line', cursor.id) : undefined,
      limit,
    },
  );
  return lines;
}
