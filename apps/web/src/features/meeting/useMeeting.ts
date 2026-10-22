import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientRtc, Meeting, MeetingDetail, Poll, RealtimeEvent, RtcSignal, ServerRtc } from '@project-room/shared';
import { meetingsApi } from '../../api/meetings';
import { useRealtime } from '../../api/realtime';
import { useSession } from '../../state/session';

/** Merges one record into a list by id (idempotent: the realtime echo of our own POST is a no-op). */
const upsert = <T extends { id: string }>(list: T[], record: T) =>
  list.some((x) => x.id === record.id) ? list.map((x) => (x.id === record.id ? record : x)) : [...list, record];

/**
 * The project's live meeting (if any) with its transcript and polls, plus recent meetings.
 * Opens its own realtime socket and merges only meeting / transcript_line / poll events.
 */
export function useMeeting(projectId: string) {
  const { memberId } = useSession();
  const [current, setCurrent] = useState<MeetingDetail | null>(null);
  const [recent, setRecent] = useState<Meeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const currentId = useRef<string | null>(null);
  useEffect(() => {
    currentId.current = current?.meeting.id ?? null;
  }, [current]);

  const reload = useCallback(async () => {
    const list = await meetingsApi.list(projectId);
    setRecent(list);
    const live = list.find((m) => m.status === 'live');
    // Keep showing the meeting we were in after it ends (summary comes later), else show the live one.
    const id = live?.id ?? currentId.current;
    setCurrent(id ? await meetingsApi.get(projectId, id).catch(() => null) : null);
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    // Fetch-on-mount: setState happens after the awaited request, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the awaited request
    void reload().catch(() => setLoaded(true));
  }, [reload]);

  const apply = useCallback((event: RealtimeEvent) => {
    if (event.table === 'meeting') {
      const meeting = event.record;
      setRecent((list) => upsert(list, meeting).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
      setCurrent((prev) => {
        if (prev?.meeting.id === meeting.id) return { ...prev, meeting };
        // A new live meeting started by someone else: show it (lines/polls arrive via reload).
        if (meeting.status === 'live' && prev?.meeting.status !== 'live') {
          void meetingsApi.get(meeting.projectId, meeting.id).then(setCurrent);
        }
        return prev;
      });
    } else if (event.table === 'transcript_line') {
      const line = event.record;
      setCurrent((prev) => (prev?.meeting.id === line.meetingId ? { ...prev, lines: upsert(prev.lines, line) } : prev));
    } else if (event.table === 'poll') {
      const poll = event.record;
      setCurrent((prev) => (prev && prev.meeting.id === poll.meetingId ? { ...prev, polls: upsert(prev.polls, poll) } : prev));
    }
  }, []);

  /** Merge a poll returned by an API call (the realtime echo is an idempotent upsert). */
  const applyPoll = useCallback(
    (poll: Poll) =>
      setCurrent((prev) => (prev && prev.meeting.id === poll.meetingId ? { ...prev, polls: upsert(prev.polls, poll) } : prev)),
    [],
  );

  /** Leave the ended meeting view and show whatever is live now (or the start form). */
  const dismiss = useCallback(() => {
    currentId.current = null;
    setCurrent(null);
    void reload().catch(() => {});
  }, [reload]);

  const listeners = useRef(new Set<(msg: ServerRtc) => void>());
  const sender = useRef<((msg: ClientRtc) => boolean) | null>(null);
  useRealtime(
    projectId,
    memberId,
    apply,
    () => void reload().catch(() => {}),
    (msg) => listeners.current.forEach((fn) => fn(msg)),
    sender,
  );

  /** Relay a WebRTC signal to another participant of the meeting we are showing. */
  const sendSignal = useCallback((to: string, signal: RtcSignal) => {
    if (currentId.current) sender.current?.({ type: 'rtc', meetingId: currentId.current, to, signal });
  }, []);
  /** Subscribe to incoming signals; returns the unsubscribe function. */
  const onSignal = useCallback((fn: (msg: ServerRtc) => void) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  return { sendSignal, onSignal, current, recent, loaded, reload, apply, applyPoll, setCurrent, dismiss };
}
