import { useState, type FormEvent } from 'react';
import type { Decision, MemoryAnswer } from '@project-room/shared';
import { api } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSnapshot, useWorkspace } from '../../state/workspace';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function DecisionsTab() {
  const { projectId, members, applyRecord } = useWorkspace();
  const { decisions } = useSnapshot();
  const { toastError } = useFeedback();
  const [deciding, setDeciding] = useState<string | null>(null);

  const sorted = [...decisions].sort((a, b) =>
    a.status === b.status ? (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt) : a.status === 'open' ? -1 : 1,
  );

  const record = async (id: string, outcome: string, reason: string) => {
    try {
      applyRecord('decision', await api.decide(projectId, id, { outcome, reason: reason || undefined }));
      setDeciding(null);
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <div className="list-pad">
      <AskProject />
      {sorted.length ? (
        sorted.map((d) => {
          const by = members.get(d.status === 'decided' ? (d.decidedById ?? d.raisedById) : d.raisedById);
          return (
            <div key={d.id} className="decision">
              <Avatar member={by} />
              <div>
                <strong>{d.status === 'decided' && d.outcome ? d.outcome : d.title}</strong>
                {d.status === 'decided' && d.outcome && <span className="sub">{d.title}</span>}
                {d.reason && <span className="sub">Why: {d.reason}</span>}
                <span className="sub">
                  {d.status === 'decided' ? 'Decided' : 'Raised'} by {by?.name ?? 'someone'} · {date(d.decidedAt ?? d.createdAt)}
                </span>
              </div>
              {d.status === 'decided' ? (
                <span className="status-pill decided">Decided</span>
              ) : (
                <button className="btn sm" onClick={() => setDeciding(deciding === d.id ? null : d.id)}>
                  Mark decided
                </button>
              )}
              {deciding === d.id && <DecideForm decision={d} onSubmit={record} onCancel={() => setDeciding(null)} />}
            </div>
          );
        })
      ) : (
        <div className="empty-state">No decisions recorded yet.</div>
      )}
    </div>
  );
}

/** Recording the outcome (not just a flag) is what lets the team's memory answer questions later. */
function DecideForm({
  decision,
  onSubmit,
  onCancel,
}: {
  decision: Decision;
  onSubmit: (id: string, outcome: string, reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onSubmit(decision.id, outcome.trim(), reason.trim());
    setBusy(false);
  };
  return (
    <form className="decide-form" onSubmit={submit}>
      <input
        value={outcome}
        onChange={(e) => setOutcome(e.target.value)}
        placeholder="What did the team decide?"
        maxLength={240}
        autoFocus
      />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (optional)" maxLength={400} />
      <div className="action-buttons">
        <button className="btn primary sm" disabled={busy || !outcome.trim()}>
          Record decision
        </button>
        <button type="button" className="btn sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** "Why did we pick X?" Answered from approved decisions only; each answer lists the decisions it used. */
function AskProject() {
  const { projectId } = useWorkspace();
  const { toastError } = useFeedback();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<MemoryAnswer | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) return;
    setBusy(true);
    try {
      setAnswer(await api.askProject(projectId, question.trim()));
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ask-project">
      <form onSubmit={ask}>
        <Icon name="sparkle" />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the project anything"
          aria-label="Ask the project"
          maxLength={300}
        />
        <button className="btn primary sm" disabled={busy || question.trim().length < 3}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </form>
      {answer && (
        <div className="ask-answer">
          <p>{answer.answer}</p>
          {answer.sources.length > 0 && (
            <ul>
              {answer.sources.map((d) => (
                <li key={d.id}>
                  <strong>{d.outcome ?? d.title}</strong> · decided {d.decidedAt ? date(d.decidedAt) : ''}
                </li>
              ))}
            </ul>
          )}
          <span className="sub">
            Answered from approved decisions only, not the chat log · {answer.ai.isMock ? 'Mock AI (keyword match)' : answer.ai.provider}
          </span>
        </div>
      )}
    </section>
  );
}
