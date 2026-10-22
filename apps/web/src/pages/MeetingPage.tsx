import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { meetingsApi } from '../api/meetings';
import { useFeedback } from '../components/Feedback';
import { ConsentDialog } from '../features/meeting/ConsentDialog';
import { MeetingTimer } from '../features/meeting/MeetingTimer';
import { Participants } from '../features/meeting/Participants';
import { splitLine } from '../features/meeting/splitLine';
import { TranscriptView } from '../features/meeting/TranscriptView';
import { useMeeting } from '../features/meeting/useMeeting';
import { useTranscriber } from '../features/meeting/useTranscriber';
import { useSession } from '../state/session';
import { useWorkspace } from '../state/workspace';

export function MeetingPage() {
  const { projectId } = useWorkspace();
  const { memberId } = useSession();
  const { toastError, confirm } = useFeedback();
  const { current, loaded, reload, setCurrent } = useMeeting(projectId);
  const [consent, setConsent] = useState<'start' | 'join' | null>(null);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('ko-KR');
  const [stoppedId, setStoppedId] = useState<string | null>(null);

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
  const { supported, interim, listening } = useTranscriber({
    language: meeting?.language ?? language,
    enabled: joined && !stopped,
    onFinal: post,
  });

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
        </form>
      ) : (
        <>
          <div className="meeting-head">
            <h1>{meeting.title}</h1>
            {live ? (
              <MeetingTimer
                meetingId={meeting.id}
                startedAt={meeting.startedAt}
                endsAt={meeting.endsAt}
                onExpire={() => void reload().catch(() => {})}
              />
            ) : (
              <span className="meeting-timer">Ended</span>
            )}
            <span className="spacer" />
            {live && !joined && (
              <button className="btn primary" onClick={() => setConsent('join')}>
                Join
              </button>
            )}
            {joined && (
              <>
                <button className="btn" onClick={() => void leave()}>
                  Leave
                </button>
                <button className="btn danger-ghost" onClick={() => void end()}>
                  End for everyone
                </button>
              </>
            )}
            {!live && (
              <button className="btn" onClick={() => setCurrent(null)}>
                Back
              </button>
            )}
          </div>
          <div className="meeting-cols">
            <section>
              <h2>In the call</h2>
              <Participants meeting={meeting} />
            </section>
            <section>
              <h2>Transcript{listening ? ' · listening' : ''}</h2>
              {joined && !supported && (
                <p className="meeting-notice">
                  Your speech isn’t transcribed in this browser. Use Chrome to be heard; you can still read along.
                </p>
              )}
              {joined && stopped && <p className="meeting-notice">The meeting has ended, so transcribing stopped.</p>}
              <TranscriptView lines={current.lines} interim={joined ? interim : ''} />
            </section>
            <section>
              <h2>AI suggestions</h2>
              <p className="empty-state">
                The live AI isn’t built yet. It arrives in a later step (Phase 3); nothing is suggested during the meeting for now.
              </p>
            </section>
          </div>
        </>
      )}
      <ConsentDialog open={!!consent} action={consent ?? 'join'} onClose={() => setConsent(null)} onAccept={() => void accept()} />
    </div>
  );
}
