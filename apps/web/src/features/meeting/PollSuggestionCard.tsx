import { useState } from 'react';
import type { PollDraft, Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import { SuggestionWhy } from './SuggestionWhy';

/** AI-proposed poll; Review lets the member edit the question and 2-5 options before it opens. */
export function PollSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const draft = suggestion.pollDraft;
  const [form, setForm] = useState<PollDraft>(draft ?? { question: '', options: [] });
  if (!draft) return null;

  const run = async (action: () => Promise<Suggestion>, message: string) => {
    setBusy(true);
    try {
      applyRecord('suggestion', await action());
      toast(message);
      setOpen(false);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      await api.updateSuggestion(projectId, suggestion.id, {
        pollDraft: { question: form.question.trim(), options: form.options.map((o) => o.trim()) },
      });
      return api.approveSuggestion(projectId, suggestion.id);
    }, 'Poll opened');
  const setOption = (i: number, v: string) => setForm({ ...form, options: form.options.map((o, j) => (j === i ? v : o)) });
  const valid = !!form.question.trim() && form.options.length >= 2 && form.options.every((o) => o.trim());

  return (
    <div className="ai-card">
      <span className="ai-badge">
        <Icon name="sparkle" />
        Poll: {draft.question}
      </span>
      <ul>
        {draft.options.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>
      <SuggestionWhy suggestion={suggestion} />
      <div className="action-buttons">
        <button className="btn success sm" disabled={busy} onClick={() => setOpen(true)}>
          Review &amp; approve
        </button>
        <button
          className="btn sm"
          disabled={busy}
          onClick={() => void run(() => api.dismissSuggestion(projectId, suggestion.id), 'Suggestion dismissed')}
        >
          Dismiss
        </button>
      </div>
      <Modal
        open={open}
        title="Open a poll"
        eyebrow="AI suggestion"
        onClose={() => setOpen(false)}
        onSubmit={() => void save()}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !valid}>
              Save &amp; open poll
            </button>
          </>
        }
      >
        <label className="form-row">
          Question
          <input value={form.question} maxLength={200} onChange={(e) => setForm({ ...form, question: e.target.value })} />
        </label>
        {form.options.map((o, i) => (
          <div key={i} className="form-row poll-edit-row">
            <input aria-label={`Option ${i + 1}`} value={o} maxLength={80} onChange={(e) => setOption(i, e.target.value)} />
            <button
              type="button"
              className="icon-btn"
              aria-label="Remove option"
              disabled={form.options.length <= 2}
              onClick={() => setForm({ ...form, options: form.options.filter((_, j) => j !== i) })}
            >
              <Icon name="x" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn sm"
          disabled={form.options.length >= 5}
          onClick={() => setForm({ ...form, options: [...form.options, ''] })}
        >
          Add option
        </button>
      </Modal>
    </div>
  );
}
