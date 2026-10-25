import { useState } from 'react';
import type { Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import { IdeaDetails } from './IdeaDetails';

/** Lets a member review and explicitly approve or dismiss a topic proposal. */
export function BrainstormTopicSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, applyRecord, reload, snapshot } = useWorkspace();
  const { toast, toastError, confirm } = useFeedback();
  const target = snapshot?.ideas.find((idea) => idea.kind === 'problem' && idea.id === suggestion.ideaId);
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
    if (suggestion.ideaId) {
      if (!target) return;
      if (
        !(await confirm({
          title: `Replace “${target.title}”?`,
          text: `This clears all ideas, research, strategies and drafts from “${target.title}” and changes its topic to “${title.trim()}”. Other boards and existing tasks stay in place.`,
          okLabel: 'Replace topic and clear board',
        }))
      )
        return;
    }
    setBusy(true);
    try {
      await api.updateSuggestion(projectId, suggestion.id, {
        ideaDraft: { ...draft, title: title.trim(), description: description.trim() },
      });
      applyRecord('suggestion', await api.approveSuggestion(projectId, suggestion.id, target ? { replaceTopicId: target.id } : {}));
      reload();
      toast(suggestion.ideaId ? 'Brainstorm topic updated' : 'New brainstorm topic added');
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
        <Icon name="sparkle" /> {suggestion.ideaId ? 'Topic change' : 'New topic'} · review required
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
        <p>
          {target
            ? `Replaces “${target.title}” and clears all of its ideas, research, strategies and drafts.`
            : 'The board targeted by this proposal is no longer available. Dismiss this proposal.'}
        </p>
      )}
      {!suggestion.ideaId && <p>Creates a separate topic tab with its own brainstorming board.</p>}
      <div className="action-buttons">
        <button className="btn idea-btn sm" disabled={busy || (!!suggestion.ideaId && !target)} onClick={() => setReviewing(true)}>
          Review &amp; {suggestion.ideaId ? 'update topic' : 'add topic'}
        </button>
        <button className="btn sm" disabled={busy} onClick={() => void dismiss()}>
          Dismiss
        </button>
      </div>
      <Modal
        wide
        open={reviewing}
        title={suggestion.ideaId ? 'Review topic change' : 'Review new brainstorm topic'}
        eyebrow={suggestion.ideaId ? 'The topic changes only when you approve' : 'Add a separate board for this topic'}
        onClose={() => setReviewing(false)}
        onSubmit={() => void approve()}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setReviewing(false)}>
              Cancel
            </button>
            <button className="btn idea-btn" disabled={busy || !title.trim() || (!!suggestion.ideaId && !target)}>
              {suggestion.ideaId ? 'Update topic' : 'Add topic'}
            </button>
          </>
        }
      >
        {target && <p>Updating “{target.title}” clears its ideas, research, strategies and drafts.</p>}
        <label className="form-row">
          Question or goal
          <input value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="form-row">
          Context or constraints
          <textarea value={description} rows={5} maxLength={240} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </Modal>
    </article>
  );
}
