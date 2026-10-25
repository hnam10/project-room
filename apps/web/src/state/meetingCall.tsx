import { splitLine } from '@project-room/shared';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { ApiError } from '../api/client';
import { meetingsApi } from '../api/meetings';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { useClipTranscriber } from '../features/meeting/useClipTranscriber';
import { useMeeting } from '../features/meeting/useMeeting';
import { useMeshAudio } from '../features/meeting/useMeshAudio';
import { useTranscriber } from '../features/meeting/useTranscriber';
import { useSession } from './session';
import { useWorkspace } from './workspace';

function RemoteAudio({ stream, onBlocked }: { stream: MediaStream; onBlocked: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const blocked = useRef(onBlocked);
  useEffect(() => {
    blocked.current = onBlocked;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    el.play().catch(() => blocked.current());
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function useCallState() {
  const { projectId } = useWorkspace();
  const { memberId } = useSession();
  const { toast, toastError, confirm } = useFeedback();
  const meetingState = useMeeting(projectId);
  const { current, reload, sendSignal, onSignal } = meetingState;
  const [stoppedId, setStoppedId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [ice, setIce] = useState<{ meetingId: string; servers: RTCIceServer[]; serverStt: boolean } | null>(null);

  const meeting = current?.meeting;
  const live = meeting?.status === 'live';
  const joined = !!meeting && live && meeting.participantIds.includes(memberId);
  const meetingId = meeting?.id;
  const stopped = stoppedId === meetingId;

  // Keep local microphone changes immediate; serialize server writes so quick toggles cannot arrive out of order.
  const muteQueue = useRef(Promise.resolve());
  useEffect(() => {
    if (!joined || !meetingId) return;
    let cancelled = false;
    muteQueue.current = muteQueue.current
      .catch(() => {})
      .then(async () => {
        if (cancelled) return;
        try {
          await meetingsApi.setMuted(projectId, meetingId, muted);
        } catch (error) {
          if (!cancelled) toastError(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [joined, meetingId, projectId, muted, toastError]);

  // Post each final result, split to the server's 1000-char limit, in order.
  const queue = useRef(Promise.resolve());
  const post = useCallback(
    (text: string) => {
      if (!meetingId) return;
      queue.current = queue.current.then(async () => {
        for (const chunk of splitLine(text)) {
          try {
            await meetingsApi.postLine(projectId, meetingId, chunk);
          } catch (e) {
            // 409: the meeting ended or expired. Stop transcribing.
            if (e instanceof ApiError && e.status === 409) setStoppedId(meetingId);
            else toastError(e);
            return;
          }
        }
      });
    },
    [projectId, meetingId, toastError],
  );
  const iceReady = ice?.meetingId === meetingId;
  const serverStt = iceReady && !!ice?.serverStt;
  const browser = useTranscriber({
    language: meeting?.language ?? 'en-US',
    enabled: joined && !stopped && !muted && iceReady && !serverStt,
    onFinal: post,
  });

  // ICE servers once per meeting join.
  useEffect(() => {
    if (!joined || !meetingId) return;
    let cancelled = false;
    meetingsApi
      .rtcConfig(projectId)
      .then((c) => ({ servers: c.iceServers as RTCIceServer[], serverStt: c.transcription === 'server' }))
      .catch(() => ({ servers: [] as RTCIceServer[], serverStt: false }))
      .then((c) => !cancelled && setIce({ meetingId, ...c }));
    return () => {
      cancelled = true;
      setIce(null);
    };
  }, [joined, projectId, meetingId]);

  const { peers, localStream, remoteStreams, micError } = useMeshAudio({
    enabled: joined && !stopped && iceReady,
    meetingId,
    me: memberId,
    participantIds: meeting?.participantIds ?? [],
    iceServers: ice?.servers ?? [],
    sendSignal,
    onSignal,
    muted,
  });
  const sendClip = useCallback(
    async (clip: Blob) => {
      if (!meetingId) return;
      try {
        await meetingsApi.postAudio(projectId, meetingId, clip);
      } catch (e) {
        // 409: the meeting ended or expired. Stop transcribing.
        if (e instanceof ApiError && e.status === 409) setStoppedId(meetingId);
        else throw e;
      }
    },
    [projectId, meetingId],
  );
  const clips = useClipTranscriber({ stream: localStream, enabled: joined && !stopped && !muted && serverStt, send: sendClip });
  const [blocked, setBlocked] = useState(false);

  const count = meeting?.participantIds.length ?? 0;
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (joined && count > 6 && warned.current !== meetingId) {
      warned.current = meetingId ?? null;
      toast('More than 6 people are in this call — audio may stutter.');
    }
  }, [joined, count, meetingId, toast]);

  // Stop the call at the 60-minute cap on any page; the server's sweep that ends it can take a few seconds to arrive.
  const endsAt = live ? meeting?.endsAt : undefined;
  useEffect(() => {
    if (!endsAt || !meetingId) return;
    const t = window.setTimeout(
      () => {
        setStoppedId(meetingId);
        void reload().catch(() => {});
      },
      Math.max(0, new Date(endsAt).getTime() - Date.now()),
    );
    return () => window.clearTimeout(t);
  }, [endsAt, meetingId, reload]);

  // Closing the tab needs no leave call: the server drops a member whose last socket closed, and ends the
  // meeting if it stays empty, so a refresh doesn't end it.

  const leave = async () => {
    // The last one out ends the meeting for good, so say so first.
    if (
      meeting?.participantIds.length === 1 &&
      !(await confirm({
        title: 'Leave and end the meeting?',
        text: 'You’re the last one here, so leaving ends the meeting and starts the summary.',
        okLabel: 'Leave and end',
      }))
    )
      return;
    try {
      await meetingsApi.leave(projectId, meetingId!);
    } catch (e) {
      toastError(e);
    }
    await reload().catch(() => {});
  };

  return {
    ...meetingState,
    meeting,
    live,
    joined,
    stopped,
    /** The 60-minute cap ran out: stop transcribing and pick up the ended meeting. */
    expire: () => {
      if (meetingId) setStoppedId(meetingId);
      void reload().catch(() => {});
    },
    muted,
    setMuted,
    localStream,
    remoteStreams,
    micError,
    audioFailed: [...peers].some(([id, state]) => state === 'failed' && (meeting?.participantIds ?? []).includes(id)),
    blocked,
    setBlocked,
    supported: serverStt || browser.supported,
    listening: serverStt ? clips.listening : browser.listening,
    error: serverStt ? clips.error : browser.error,
    interim: serverStt ? '' : browser.interim,
    leave,
  };
}

type MeetingCall = ReturnType<typeof useCallState>;
const MeetingCallContext = createContext<MeetingCall | null>(null);

/**
 * The project's meeting call lives above the routed pages, so moving to another page keeps the mic, the other
 * participants' audio and the transcript going. Off the meeting page, a small bar keeps mute and leave at hand.
 */
export function MeetingCallProvider({ children }: { children: ReactNode }) {
  const call = useCallState();
  const onMeetingPage = !!useMatch('/p/:projectId/meeting');
  return (
    <MeetingCallContext.Provider value={call}>
      {children}
      <div className="meeting-audio" hidden>
        {call.joined &&
          [...call.remoteStreams].map(([id, stream]) => <RemoteAudio key={id} stream={stream} onBlocked={() => call.setBlocked(true)} />)}
      </div>
      {call.joined && !onMeetingPage && call.meeting && (
        <div className="meeting-mini" role="region" aria-label="Meeting in progress">
          <span className="live-badge">Live</span>
          <NavLink to="meeting" className="meeting-mini-title" title="Back to the meeting">
            {call.meeting.title}
          </NavLink>
          <button
            className={`call-btn${call.muted ? ' off' : ''}`}
            aria-pressed={call.muted}
            aria-label={call.muted ? 'Unmute' : 'Mute'}
            title={call.muted ? 'Unmute' : 'Mute'}
            onClick={() => call.setMuted((m) => !m)}
          >
            <Icon name={call.muted ? 'micOff' : 'mic'} />
          </button>
          <button className="btn sm" onClick={() => void call.leave()}>
            Leave
          </button>
        </div>
      )}
    </MeetingCallContext.Provider>
  );
}

export function useMeetingCall(): MeetingCall {
  const call = useContext(MeetingCallContext);
  if (!call) throw new Error('useMeetingCall must be used inside MeetingCallProvider');
  return call;
}

/** Plays remote audio the browser blocked from autoplaying; needs a click on the page. */
export function playBlockedAudio(): void {
  document.querySelectorAll<HTMLAudioElement>('.meeting-audio audio').forEach((a) => void a.play().catch(() => {}));
}
