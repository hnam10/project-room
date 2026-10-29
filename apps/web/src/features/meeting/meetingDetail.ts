import type { MeetingDetail } from '@project-room/shared';

/** A delayed fetch must not undo a join/leave or discard lines received while it was in flight. */
export function mergeMeetingLoad(current: MeetingDetail | null, fetched: MeetingDetail | null, changed: boolean): MeetingDetail | null {
  if (changed && current?.meeting.id !== fetched?.meeting.id) return current;
  if (!fetched) return changed ? current : null;
  if (current?.meeting.id !== fetched.meeting.id) return fetched;
  const lines = new Map(fetched.lines.map((line) => [line.id, line]));
  const polls = new Map(fetched.polls.map((poll) => [poll.id, poll]));
  current.lines.forEach((line) => lines.set(line.id, line));
  if (changed) current.polls.forEach((poll) => polls.set(poll.id, poll));
  return {
    meeting: changed ? current.meeting : fetched.meeting,
    lines: [...lines.values()].sort((a, b) => a.spokenAt.localeCompare(b.spokenAt)),
    polls: changed ? [...polls.values()] : fetched.polls,
  };
}
