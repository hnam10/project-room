import { useRef, useState } from 'react';
import { meetingsApi } from '../api/meetings';
import { useFeedback } from '../components/Feedback';
import { Icon } from '../components/Icon';
import { useAttachFiles, useFileDrop } from '../features/chat/useAttachFiles';
import { ResizeHandle } from '../features/dock/ResizeHandle';
import { ConsentDialog } from '../features/meeting/ConsentDialog';
import { AudioCheck } from '../features/meeting/AudioCheck';
import { MeetingAiPanel } from '../features/meeting/MeetingAiPanel';
import { MeetingChat } from '../features/meeting/MeetingChat';
import { LastTimeCard } from '../features/meeting/LastTimeCard';
import { MeetingSummaryView } from '../features/meeting/MeetingSummaryView';
import { MeetingTimer } from '../features/meeting/MeetingTimer';
import { Participants } from '../features/meeting/Participants';
import { TranscriptView } from '../features/meeting/TranscriptView';
import { useMeetingCall } from '../state/meetingCall';
import { useWorkspace } from '../state/workspace';

const AI_MIN_W = 240;
const TRANSCRIPT_MIN_W = 320;

export function MeetingPage() {
  const { projectId, snapshot } = useWorkspace();
  const { toastError } = useFeedback();
  const call = useMeetingCall();
  const { current, loaded, reload, applyPoll, setCurrent, dismiss, select, recent, live, joined, stopped, muted } = call;
  const meeting = current?.meeting;
  const [consent, setConsent] = useState<'start' | 'join' | null>(null);
  const [title, setTitle] = useState('');
  const [aiWidth, setAiWidth] = useState<number | null>(null);
  const cols = useRef<HTMLDivElement>(null);
  // Files shared in the meeting chat land in Files too; the line arrives through realtime like any other.
  const canChat = !!meeting && joined && !stopped;
  const files = useAttachFiles((file) => meetingsApi.postLine(projectId, meeting!.id, file.name, 'chat', file.id));
  const { fileOver, dropProps } = useFileDrop(canChat, (dropped) => void files.attach(dropped));

  // Keeps both the transcript and the AI column readable (the first column is 220px).
  const resizeAi = (px: number) => {
    const width = cols.current?.getBoundingClientRect().width ?? 0;
    if (width) setAiWidth(Math.round(Math.max(AI_MIN_W, Math.min(px, width - 220 - TRANSCRIPT_MIN_W))));
  };

  const accept = async () => {
    const action = consent;
    setConsent(null);
    try {
      const m =
        action === 'start'
          ? await meetingsApi.start(projectId, { title: title.trim() || undefined })
          : await meetingsApi.join(projectId, meeting!.id);
      if (action === 'start') await reload();
      else setCurrent((prev) => (prev ? { ...prev, meeting: m } : prev));
    } catch (e) {
      toastError(e);
      void reload().catch(() => {});
    }
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
          <span className="meeting-start-icon">
            <Icon name="mic" />
          </span>
          <h1>Meeting room</h1>
          <p className="meeting-start-text">
            Start a conversation about your project. AI listens and proposes ideas and tasks for you to review; nothing is added to the
            board until you approve it. Teammates can join, and meetings last at most 60 minutes.
          </p>
          {snapshot?.members.length === 1 && snapshot.ideas.length === 0 && snapshot.tasks.length === 0 && (
            <div className="meeting-starters">
              <strong>Not sure where to start? Try saying:</strong>
              <ul>
                <li>“The problem I want to solve is…”</li>
                <li>“The people who need this are…”</li>
                <li>“One possible solution is…”</li>
              </ul>
              <p>Speak in complete thoughts so the transcript gives AI enough context to suggest a useful idea or task.</p>
            </div>
          )}
          <label>
            Title (optional)
            <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly sync" />
          </label>
          <button className="btn primary">Start meeting</button>
          {recent.length > 0 && (
            <>
              <h2>Meeting history</h2>
              <ul className="recent-meetings">
                {recent.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => void select(projectId, r.id).catch(toastError)}>
                      <b>{r.title}</b>
                      <span>{new Date(r.startedAt).toLocaleDateString()}</span>
                      <span className={`status-chip ${r.status}`}>{r.status === 'summarizing' ? 'Summarizing' : 'Ended'}</span>
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
              <MeetingTimer meetingId={meeting.id} startedAt={meeting.startedAt} endsAt={meeting.endsAt} onExpire={call.expire} />
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
            <div ref={cols} className="meeting-cols" style={aiWidth ? ({ '--ai-w': `${aiWidth}px` } as React.CSSProperties) : undefined}>
              <section>
                <h2>In the call</h2>
                {joined && call.micError && <p className="meeting-notice">Microphone unavailable — others can’t hear you.</p>}
                {joined && call.audioFailed && (
                  <div className="meeting-notice">
                    Audio connection failed.{' '}
                    <button className="btn sm" onClick={call.retryAudio}>
                      Reconnect audio
                    </button>
                  </div>
                )}
                {joined && call.blocked && (
                  <button
                    className="btn"
                    onClick={() => {
                      void call.enableAudio();
                    }}
                  >
                    Click to enable audio
                  </button>
                )}
                <Participants meeting={meeting} localStream={call.localStream} remoteStreams={call.remoteStreams} muted={muted} />
                {joined && (
                  <AudioCheck
                    stream={call.localStream}
                    check={call.checkAudio}
                    transcript={call.transcriptionStatus}
                    names={new Map(snapshot?.members.map((member) => [member.id, member]) ?? [])}
                  />
                )}
              </section>
              <section
                className={fileOver ? 'file-over' : undefined}
                data-drop-label="Drop files to share them in the meeting"
                {...dropProps}
              >
                <h2>Transcript{call.listening ? ' · listening' : ''}</h2>
                {meeting.previousMeetingId && <LastTimeCard projectId={projectId} previousId={meeting.previousMeetingId} />}
                {joined && call.error && <p className="meeting-notice">{call.error}</p>}
                {joined && !call.supported && (
                  <p className="meeting-notice">
                    Your speech isn’t transcribed in this browser. Use Chrome to be heard; you can still read along.
                  </p>
                )}
                {joined && stopped && <p className="meeting-notice">The meeting has ended, so transcribing stopped.</p>}
                <TranscriptView lines={current.lines} interim={joined ? call.interim : ''} />
                {canChat && <MeetingChat meetingId={meeting.id} files={files} />}
              </section>
              <ResizeHandle
                orientation="vertical"
                label="Resize transcript and AI suggestions"
                onDrag={(x) => resizeAi((cols.current?.getBoundingClientRect().right ?? 0) - x)}
                onNudge={(d) => resizeAi((cols.current?.lastElementChild?.getBoundingClientRect().width ?? 0) - d)}
                onReset={() => setAiWidth(null)}
              />
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
                    onClick={() => call.setMuted((m) => !m)}
                  >
                    <Icon name={muted ? 'micOff' : 'mic'} />
                  </button>
                  <button className="btn" onClick={() => void call.leave()}>
                    Leave
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
