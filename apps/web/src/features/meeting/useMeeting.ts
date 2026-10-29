import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { ClientRtc, Meeting, MeetingDetail, Poll, RealtimeEvent, RtcSignal, ServerRtc, TranscriptLine } from '@project-room/shared';
import { mergeMeetingLoad } from './meetingDetail';
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
  const [current, updateCurrent] = useState<MeetingDetail | null>(null);
  const version = useRef(0);
  const request = useRef(0);
  const setCurrent = useCallback<Dispatch<SetStateAction<MeetingDetail | null>>>((value) => {
    version.current++;
    updateCurrent(value);
  }, []);
  const [recent, setRecent] = useState<Meeting[]>([]);
  const [loaded, setLoaded] = useState(false);
  const currentId = useRef<string | null>(null);
  useEffect(() => {
    currentId.current = current?.meeting.id ?? null;
  }, [current]);

  const reload = useCallback(async () => {
    const token = ++request.current;
    const before = version.current;
    const list = await meetingsApi.list(projectId);
    if (token !== request.current) return;
    setRecent(list);
    const live = list.find((m) => m.status === 'live');
    // Keep showing the meeting we were in after it ends (summary comes later), else show the live one.
    const id = live?.id ?? currentId.current;
    const detail = id ? await meetingsApi.get(projectId, id) : null;
    if (token !== request.current) return;
    const changed = version.current !== before;
    updateCurrent((previous) => mergeMeetingLoad(previous, detail, changed));
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    void reload().catch(() => setLoaded(true));
  }, [reload]);

  const apply = useCallback(
    (event: RealtimeEvent) => {
      if (event.table === 'meeting') {
        const meeting = event.record;
        setRecent((list) => upsert(list, meeting).sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
        setCurrent((prev) => {
          if (prev?.meeting.id === meeting.id) return { ...prev, meeting };
          // New meetings start empty; subsequent lines/polls arrive through realtime.
          if (meeting.status === 'live' && prev?.meeting.status !== 'live') {
            return { meeting, lines: [], polls: [] };
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
    },
    [setCurrent],
  );

  const applyLine = useCallback(
    (line: TranscriptLine) => {
      setCurrent((previous) => (previous?.meeting.id === line.meetingId ? { ...previous, lines: upsert(previous.lines, line) } : previous));
    },
    [setCurrent],
  );

  /** Merge a poll returned by an API call (the realtime echo is an idempotent upsert). */
  const applyPoll = useCallback(
    (poll: Poll) =>
      setCurrent((prev) => (prev && prev.meeting.id === poll.meetingId ? { ...prev, polls: upsert(prev.polls, poll) } : prev)),
    [setCurrent],
  );

  /** Leave the ended meeting view and show whatever is live now (or the start form). */
  const dismiss = useCallback(() => {
    currentId.current = null;
    setCurrent(null);
    void reload().catch(() => {});
  }, [reload, setCurrent]);

  /** Open a recent meeting (its ended view). */
  const select = useCallback(
    async (projectId_: string, id: string) => {
      const token = ++request.current;
      currentId.current = id;
      const detail = await meetingsApi.get(projectId_, id);
      if (token === request.current) setCurrent(detail);
    },
    [setCurrent],
  );

  const listeners = useRef(new Set<(msg: ServerRtc) => void>());
  const sender = useRef<((msg: ClientRtc) => boolean) | null>(null);
  const connection = useRealtime(
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

  return { sendSignal, onSignal, connection, current, recent, loaded, reload, apply, applyPoll, applyLine, setCurrent, dismiss, select };
}
