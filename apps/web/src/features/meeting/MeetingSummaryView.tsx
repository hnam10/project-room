import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ActionItem, MeetingDetail, Poll, Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { meetingsApi } from '../../api/meetings';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { ActionItemsCard } from '../chat/ActionItemsCard';
import { PollCard } from '../polls/PollCard';
import { IdeaSuggestionCard } from './IdeaSuggestionCard';
import { BrainstormTopicSuggestionCard } from '../brainstorm/BrainstormTopicSuggestionCard';
import { PollSuggestionCard } from './PollSuggestionCard';
import { TranscriptView } from './TranscriptView';

/** Checklist for the `meeting_notes` suggestion: toggle, edit, then Confirm notes (PATCH items, then approve). */
function NotesChecklist({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [items, setItems] = useState<ActionItem[]>(suggestion.items);
  const [busy, setBusy] = useState(false);
  const edit = (i: number, patch: Partial<ActionItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const confirm = async () => {
    setBusy(true);
    try {
      await api.updateSuggestion(projectId, suggestion.id, { items });
      applyRecord('suggestion', await api.approveSuggestion(projectId, suggestion.id));
      toast('Notes saved for the next meeting');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-card">
      <span className="ai-badge">
        <Icon name="sparkle" />
        Notes for next time
      </span>
      {items.map((it, i) => (
        <label className="note-row" key={i}>
          <input type="checkbox" checked={it.include} onChange={(e) => edit(i, { include: e.target.checked })} />
          <input value={it.title} maxLength={120} onChange={(e) => edit(i, { title: e.target.value })} />
        </label>
      ))}
      <div className="action-buttons">
        <button className="btn success sm" disabled={busy} onClick={() => void confirm()}>
          Confirm notes
        </button>
      </div>
    </div>
  );
}

const Section = ({ title, items }: { title: string; items: string[] }) =>
  items.length ? (
    <>
      <h3>{title}</h3>
      <ul>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </>
  ) : null;

/** What an ended (or still summarizing) meeting shows instead of the live columns. */
export function MeetingSummaryView(props: {
  detail: MeetingDetail;
  applyPoll: (poll: Poll) => void;
  setCurrent: Dispatch<SetStateAction<MeetingDetail | null>>;
}) {
  const { meeting, lines, polls } = props.detail;
  const { projectId } = useWorkspace();
  const { suggestions } = useSnapshot();
  const { toastError } = useFeedback();
  const [retrying, setRetrying] = useState(false);
  const pending = suggestions
    .filter((s) => s.meetingId === meeting.id && s.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notes = pending.find((s) => s.kind === 'meeting_notes');
  const others = pending.filter((s) => s.kind !== 'meeting_notes');
  const { summary, usage } = meeting;

  const retry = async () => {
    setRetrying(true);
    try {
      props.setCurrent((prev) => (prev ? { ...prev, meeting: { ...prev.meeting, summaryError: null } } : prev));
      await meetingsApi.end(projectId, meeting.id);
    } catch (e) {
      toastError(e);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="meeting-summary">
      {meeting.status === 'summarizing' && <p className="meeting-notice">Claude is writing the summary…</p>}
      {meeting.summaryError && (
        <p className="meeting-notice">
          Summary failed — {meeting.summaryError}{' '}
          <button className="btn sm" disabled={retrying} onClick={() => void retry()}>
            Retry summary
          </button>
        </p>
      )}
      {summary && (
        <section className="ai-card">
          <span className="ai-badge">
            <Icon name="sparkle" />
            AI summary
          </span>
          {summary.overview && (
            <>
              <h3>Overview</h3>
              <p>{summary.overview}</p>
            </>
          )}
          <Section title="Decisions" items={summary.decisions} />
          {summary.decisions.length > 0 && (
            <p className="meeting-note-small">Decisions become official only when someone records them in the Decisions tab.</p>
          )}
          <Section title="Open questions" items={summary.openQuestions} />
          <Section title="Next steps" items={summary.nextSteps} />
        </section>
      )}
      {notes ? (
        <NotesChecklist key={notes.id} suggestion={notes} />
      ) : (
        meeting.carryOver.length > 0 && (
          <section className="last-time">
            <h3>Notes for next time</h3>
            <ul>
              {meeting.carryOver.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        )
      )}
      {polls.map((p) => (
        <PollCard key={p.id} poll={p} onChange={props.applyPoll} />
      ))}
      {others.some((suggestion) => suggestion.kind === 'brainstorm_topic') && (
        <p className="meeting-note-small">The topic and idea suggestions remain available in Brainstorm until reviewed.</p>
      )}
      {others.map((s) =>
        s.kind === 'action_items' ? (
          <ActionItemsCard key={s.id} suggestion={s} />
        ) : s.kind === 'brainstorm_topic' ? (
          <BrainstormTopicSuggestionCard key={s.id} suggestion={s} />
        ) : s.kind === 'idea' ? (
          <IdeaSuggestionCard key={s.id} suggestion={s} />
        ) : s.kind === 'poll' ? (
          <PollSuggestionCard key={s.id} suggestion={s} />
        ) : null,
      )}
      <details>
        <summary>Transcript ({lines.length} lines)</summary>
        <TranscriptView lines={lines} interim="" />
      </details>
      <p className="meeting-note-small">
        {usage.calls} AI calls · {Math.round((usage.inputTokens + usage.outputTokens) / 100) / 10}k tokens
      </p>
    </div>
  );
}
