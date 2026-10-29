import { expect, it } from 'vitest';
import type { MeetingDetail } from '@project-room/shared';
import { mergeMeetingLoad } from '../../web/src/features/meeting/meetingDetail.js';
const detail = (participants: string[], lines: string[] = [], id = 'meeting') =>
  ({
    meeting: { id, participantIds: participants },
    lines: lines.map((id, index) => ({ id, spokenAt: String(index) })),
    polls: [],
  }) as unknown as MeetingDetail;
it('does not let a pre-join fetch remove the member or erase new transcript lines', () => {
  const current = detail(['a', 'b', 'c'], ['first', 'second']);
  const result = mergeMeetingLoad(current, detail(['a'], ['first']), true)!;
  expect(result.meeting.participantIds).toEqual(['a', 'b', 'c']);
  expect(result.lines.map((line) => line.id)).toEqual(['first', 'second']);
});
it('keeps explicit navigation or a new meeting when an older request completes', () => {
  expect(mergeMeetingLoad(null, detail(['a']), true)).toBeNull();
  const current = detail(['b'], [], 'new');
  expect(mergeMeetingLoad(current, detail(['a']), true)).toBe(current);
});
it('accepts a reconnect snapshot when no more recent membership update exists', () => {
  const result = mergeMeetingLoad(detail(['a'], ['first']), detail(['a', 'b'], ['first', 'second']), false)!;
  expect(result.meeting.participantIds).toEqual(['a', 'b']);
  expect(result.lines.map((line) => line.id)).toEqual(['first', 'second']);
});
