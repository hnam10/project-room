import { useState } from 'react';
import type { Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import { IdeaDetails } from './IdeaDetails';

export function BrainstormTopicSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, applyRecord, reload } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const draft = suggestion.ideaDraft;
  const [title, setTitle] = useState(draft?.title ?? '');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!draft) return null;

  const dismiss = async () => {
    setBusy(true);
    try {
      applyRecord('suggestion', await api.dismissSuggestion(projectId, suggestion.id));
      toast('Topic suggestion dismissed');
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.updateSuggestion(projectId, suggestion.id, {
        ideaDraft: { ...draft, title: title.trim(), description: description.trim() },
      });
      applyRecord('suggestion', await api.approveSuggestion(projectId, suggestion.id));
      reload();
      toast(suggestion.ideaId ? 'Brainstorm topic updated' : 'Brainstorm topic set');
      setReviewing(false);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="brainstorm-topic-draft">
      <strong className="ai-draft-label">
        <Icon name="sparkle" /> AI topic · review required
      </strong>
      <h3>{draft.title}</h3>
      <IdeaDetails description={draft.description} />
      <p>
        <strong>Why:</strong> {suggestion.reason}
      </p>
      {suggestion.quote && (
        <blockquote>
          “{suggestion.quote}”{suggestion.cite && <cite>{suggestion.cite}</cite>}
        </blockquote>
      )}
      {suggestion.ideaId && (
        <p>Approving replaces this topic and clears all of its ideas, research, strategies and drafts. Other topic boards stay in place.</p>
      )}
      <div className="action-buttons">
        <button className="btn success sm" disabled={busy} onClick={() => setReviewing(true)}>
          Review &amp; {suggestion.ideaId ? 'update topic' : 'set topic'}
        </button>
        <button className="btn sm" disabled={busy} onClick={() => void dismiss()}>
          Dismiss
        </button>
      </div>
      <Modal
        open={reviewing}
        title={suggestion.ideaId ? 'Review topic change' : 'Review brainstorm topic'}
        eyebrow="The topic changes only when you approve"
        onClose={() => setReviewing(false)}
        onSubmit={() => void approve()}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setReviewing(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !title.trim()}>
              {suggestion.ideaId ? 'Update topic' : 'Set topic'}
            </button>
          </>
        }
      >
        <label className="form-row">
          Question or goal
          <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="form-row">
          Context or constraints
          <textarea value={description} rows={3} maxLength={240} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </Modal>
    </article>
  );
}
