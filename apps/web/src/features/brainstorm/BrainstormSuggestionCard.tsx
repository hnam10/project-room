import { useState } from 'react';
import { IDEA_THEME_CHOICES, type IdeaDraft, type IdeaTheme, type Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import { IdeaDetails } from './IdeaDetails';

export function BrainstormSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, applyRecord, reload, snapshot } = useWorkspace();
  const topics = snapshot?.ideas.filter((idea) => idea.kind === 'problem') ?? [];
  const [topicId, setTopicId] = useState(suggestion.topicId ?? (topics.length === 1 ? topics[0]!.id : ''));
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
      applyRecord('suggestion', await api.approveSuggestion(projectId, suggestion.id, topicId ? { topicId } : {}));
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
    <article className={`idea ai-idea-draft${draftKind === 'strategy' ? ' direction' : ''}`}>
      <span className="ai-draft-label">
        <Icon name="sparkle" /> AI {draftKind} · review required
      </span>
      <h3>{draft.title}</h3>
      {suggestion.meetingId && (
        <p className="ai-draft-reason">
          <strong>Topic:</strong> {topics.find((topic) => topic.id === suggestion.topicId)?.title ?? 'Choose a topic during review'}
        </p>
      )}
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
        <button
          className={`btn ${draftKind === 'strategy' ? 'direction-btn' : 'idea-btn'} sm`}
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          Review &amp; approve
        </button>
        <button className="btn sm" disabled={busy} onClick={() => void dismiss()}>
          Dismiss
        </button>
      </div>

      <Modal
        wide
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
            <button
              className={`btn ${draftKind === 'strategy' ? 'direction-btn' : 'idea-btn'}`}
              disabled={busy || !form.title.trim() || (!suggestion.ideaId && !topicId)}
            >
              {suggestion.ideaId ? 'Update idea' : 'Add to Brainstorm'}
            </button>
          </>
        }
      >
        {!suggestion.topicId && !suggestion.ideaId && (
          <label className="form-row">
            Topic
            <select value={topicId} onChange={(event) => setTopicId(event.target.value)} required>
              <option value="">Choose a topic first</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
            {!topics.length && <small>Set a topic in Brainstorm before approving this idea.</small>}
          </label>
        )}
        <label className="form-row">
          Title
          <input value={form.title} maxLength={80} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
        <label className="form-row">
          Description
          <textarea
            value={form.description}
            rows={10}
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
