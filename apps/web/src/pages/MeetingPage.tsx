import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { meetingsApi } from '../api/meetings';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { ConsentDialog } from '../features/meeting/ConsentDialog';
import { MeetingAiPanel } from '../features/meeting/MeetingAiPanel';
import { LastTimeCard } from '../features/meeting/LastTimeCard';
import { MeetingSummaryView } from '../features/meeting/MeetingSummaryView';
import { MeetingTimer } from '../features/meeting/MeetingTimer';
import { Participants } from '../features/meeting/Participants';
import { splitLine } from '../features/meeting/splitLine';
import { TranscriptView } from '../features/meeting/TranscriptView';
import { useMeeting } from '../features/meeting/useMeeting';
import { useMeshAudio } from '../features/meeting/useMeshAudio';
import { useTranscriber } from '../features/meeting/useTranscriber';
import { useSession } from '../state/session';
import { useWorkspace } from '../state/workspace';

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

export function MeetingPage() {
  const { projectId } = useWorkspace();
  const { memberId } = useSession();
  const { toast, toastError, confirm } = useFeedback();
  const { current, loaded, reload, applyPoll, setCurrent, dismiss, select, recent, sendSignal, onSignal } = useMeeting(projectId);
  const [consent, setConsent] = useState<'start' | 'join' | null>(null);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('ko-KR');
  const [stoppedId, setStoppedId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [ice, setIce] = useState<{ meetingId: string; servers: RTCIceServer[] } | null>(null);

  const meeting = current?.meeting;
  const live = meeting?.status === 'live';
  const joined = !!meeting && live && meeting.participantIds.includes(memberId);
  const meetingId = meeting?.id;
  const stopped = stoppedId === meetingId;

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
  const { supported, interim, listening, error } = useTranscriber({
    language: meeting?.language ?? language,
    enabled: joined && !stopped && !muted,
    onFinal: post,
  });

  // ICE servers once per meeting join.
  useEffect(() => {
    if (!joined || !meetingId) return;
    let cancelled = false;
    meetingsApi
      .rtcConfig(projectId)
      .then((c) => c.iceServers as RTCIceServer[])
      .catch(() => [] as RTCIceServer[])
      .then((servers) => !cancelled && setIce({ meetingId, servers }));
    return () => {
      cancelled = true;
      setIce(null);
    };
  }, [joined, projectId, meetingId]);

  const { peers, localStream, remoteStreams, micError } = useMeshAudio({
    enabled: joined && !stopped && ice?.meetingId === meetingId,
    meetingId,
    me: memberId,
    participantIds: meeting?.participantIds ?? [],
    iceServers: ice?.servers ?? [],
    sendSignal,
    onSignal,
    muted,
  });
  const audioFailed = [...peers].some(([id, state]) => state === 'failed' && (meeting?.participantIds ?? []).includes(id));
  const [blocked, setBlocked] = useState(false);
  const audioBox = useRef<HTMLDivElement>(null);

  const count = meeting?.participantIds.length ?? 0;
  const warned = useRef<string | null>(null);
  useEffect(() => {
    if (joined && count > 6 && warned.current !== meetingId) {
      warned.current = meetingId ?? null;
      toast('More than 6 people are in this call — audio may stutter.');
    }
  }, [joined, count, meetingId, toast]);

  // Best-effort leave when the tab closes.
  useEffect(() => {
    if (!joined || !meetingId) return;
    const onHide = () => void meetingsApi.leave(projectId, meetingId).catch(() => {});
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [joined, projectId, meetingId]);

  const accept = async () => {
    const action = consent;
    setConsent(null);
    try {
      const m =
        action === 'start'
          ? await meetingsApi.start(projectId, { title: title.trim() || undefined, language })
          : await meetingsApi.join(projectId, meetingId!);
      if (action === 'start') await reload();
      else setCurrent((prev) => (prev ? { ...prev, meeting: m } : prev));
    } catch (e) {
      toastError(e);
      void reload().catch(() => {});
    }
  };

  const leave = async () => {
    try {
      await meetingsApi.leave(projectId, meetingId!);
    } catch (e) {
      toastError(e);
    }
    await reload().catch(() => {});
  };

  const end = async () => {
    if (!(await confirm({ title: 'End the meeting', text: 'End the meeting for everyone?', okLabel: 'End meeting' }))) return;
    try {
      await meetingsApi.end(projectId, meetingId!);
    } catch (e) {
      toastError(e);
    }
    await reload().catch(() => {});
  };

  if (!loaded) return <div className="meeting-page empty-state">Loading…</div>;

  return (
    <div className="meeting-page">
      {!meeting ? (
        <form
          className="meeting-start"
          onSubmit={(e) => {
            e.preventDefault();
            setConsent('start');
          }}
        >
          <h1>Meeting room</h1>
          <p className="empty-state">No meeting is live. Start one and teammates can join from here. Meetings last at most 60 minutes.</p>
          <label>
            Title (optional)
            <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly sync" />
          </label>
          <label>
            Spoken language
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="ko-KR">Korean</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <button className="btn primary">Start meeting</button>
          {recent.length > 0 && (
            <>
              <h2>Recent meetings</h2>
              <ul className="recent-meetings">
                {recent.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => void select(projectId, r.id).catch(toastError)}>
                      <b>{r.title}</b> <span>{new Date(r.startedAt).toLocaleDateString()}</span> <span>{r.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </form>
      ) : (
        <>
          <div className="meeting-head">
            <h1>{meeting.title}</h1>
            {live && <span className="live-badge">Live</span>}
            {live ? (
              <MeetingTimer
                meetingId={meeting.id}
                startedAt={meeting.startedAt}
                endsAt={meeting.endsAt}
                onExpire={() => {
                  setStoppedId(meeting.id);
                  void reload().catch(() => {});
                }}
              />
            ) : (
              <span className="meeting-timer">{meeting.status === 'summarizing' ? 'Summarizing' : 'Ended'}</span>
            )}
            <span className="spacer" />
            {!live && (
              <button className="btn" onClick={dismiss}>
                Back
              </button>
            )}
          </div>
          {!live ? (
            <MeetingSummaryView detail={current} applyPoll={applyPoll} setCurrent={setCurrent} />
          ) : (
            <div className="meeting-cols">
              <section>
                <h2>In the call</h2>
                {joined && micError && <p className="meeting-notice">Microphone unavailable — others can’t hear you.</p>}
                {joined && audioFailed && (
                  <p className="meeting-notice">Can’t connect audio on this network — the transcript and AI still work.</p>
                )}
                {joined && blocked && (
                  <button
                    className="btn"
                    onClick={() => {
                      audioBox.current?.querySelectorAll('audio').forEach((a) => void a.play().catch(() => {}));
                      setBlocked(false);
                    }}
                  >
                    Click to enable audio
                  </button>
                )}
                <div ref={audioBox} hidden>
                  {joined &&
                    [...remoteStreams].map(([id, stream]) => <RemoteAudio key={id} stream={stream} onBlocked={() => setBlocked(true)} />)}
                </div>
                <Participants meeting={meeting} localStream={localStream} remoteStreams={remoteStreams} muted={muted} />
              </section>
              <section>
                <h2>Transcript{listening ? ' · listening' : ''}</h2>
                {meeting.previousMeetingId && <LastTimeCard projectId={projectId} previousId={meeting.previousMeetingId} />}
                {joined && error && <p className="meeting-notice">{error}</p>}
                {joined && !supported && (
                  <p className="meeting-notice">
                    Your speech isn’t transcribed in this browser. Use Chrome to be heard; you can still read along.
                  </p>
                )}
                {joined && stopped && <p className="meeting-notice">The meeting has ended, so transcribing stopped.</p>}
                <TranscriptView lines={current.lines} interim={joined ? interim : ''} />
              </section>
              <section>
                <MeetingAiPanel detail={current} joined={joined} applyPoll={applyPoll} setCurrent={setCurrent} />
              </section>
            </div>
          )}
          {live && (
            <div className="call-bar">
              {joined ? (
                <>
                  <button
                    className={`call-btn${muted ? ' off' : ''}`}
                    aria-pressed={muted}
                    aria-label={muted ? 'Unmute' : 'Mute'}
                    title={muted ? 'Unmute' : 'Mute'}
                    onClick={() => setMuted((m) => !m)}
                  >
                    <Icon name={muted ? 'micOff' : 'mic'} />
                  </button>
                  <button className="btn" onClick={() => void leave()}>
                    Leave
                  </button>
                  <button className="btn end-call" onClick={() => void end()}>
                    End for everyone
                  </button>
                </>
              ) : (
                <button className="btn primary" onClick={() => setConsent('join')}>
                  <Icon name="mic" /> Join meeting
                </button>
              )}
            </div>
          )}
        </>
      )}
      <ConsentDialog open={!!consent} action={consent ?? 'join'} onClose={() => setConsent(null)} onAccept={() => void accept()} />
    </div>
  );
}
