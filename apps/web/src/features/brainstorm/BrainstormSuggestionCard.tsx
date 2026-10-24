import { useState } from 'react';
import { IDEA_THEME_CHOICES, type IdeaDraft, type IdeaTheme, type Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import { IdeaDetails } from './IdeaDetails';

export function BrainstormSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, applyRecord, reload } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const draft = suggestion.ideaDraft;
  const [form, setForm] = useState<IdeaDraft>(draft ?? { title: '', description: '', theme: IDEA_THEME_CHOICES[0] });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!draft) return null;
  const themeChoices: IdeaTheme[] = IDEA_THEME_CHOICES.some((choice) => choice === form.theme)
    ? [...IDEA_THEME_CHOICES]
    : [...IDEA_THEME_CHOICES, form.theme];
  const draftKind = draft.theme === 'Strategy' ? 'strategy' : draft.theme === 'Option' ? 'option' : 'idea';

  const dismiss = async () => {
    setBusy(true);
    try {
      applyRecord('suggestion', await api.dismissSuggestion(projectId, suggestion.id));
      toast('AI suggestion dismissed');
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await api.updateSuggestion(projectId, suggestion.id, { ideaDraft: form });
      applyRecord('suggestion', await api.approveSuggestion(projectId, suggestion.id));
      reload();
      toast(suggestion.ideaId ? 'Idea updated from AI draft' : `“${form.title}” added to Brainstorm`);
      setEditing(false);
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="idea ai-idea-draft">
      <span className="ai-draft-label">
        <Icon name="sparkle" /> AI {draftKind} · review required
      </span>
      <h3>{draft.title}</h3>
      <IdeaDetails description={draft.description} />
      <p className="ai-draft-reason">
        <strong>Why:</strong> {suggestion.reason}
      </p>
      {(suggestion.researchSources ?? []).length > 0 && (
        <div className="idea-sources">
          <strong>Research:</strong>
          {(suggestion.researchSources ?? []).map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
          ))}
        </div>
      )}
      <div className="action-buttons">
        <button className="btn success sm" disabled={busy} onClick={() => setEditing(true)}>
          Review &amp; approve
        </button>
        <button className="btn sm" disabled={busy} onClick={() => void dismiss()}>
          Dismiss
        </button>
      </div>

      <Modal
        open={editing}
        title={`Review AI ${draftKind}`}
        eyebrow={suggestion.ideaId ? 'The existing idea changes only when you approve' : 'Nothing is added until you approve'}
        onClose={() => setEditing(false)}
        onSubmit={() => void approve()}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !form.title.trim()}>
              {suggestion.ideaId ? 'Update idea' : 'Add to Brainstorm'}
            </button>
          </>
        }
      >
        <label className="form-row">
          Title
          <input value={form.title} maxLength={80} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label className="form-row">
          Description
          <textarea
            value={form.description}
            rows={4}
            maxLength={2000}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>
        <label className="form-row">
          Category
          <select value={form.theme} onChange={(event) => setForm({ ...form, theme: event.target.value as IdeaTheme })}>
            {themeChoices.map((theme) => (
              <option key={theme}>{theme}</option>
            ))}
          </select>
        </label>
      </Modal>
    </article>
  );
}
