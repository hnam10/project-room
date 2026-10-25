import { useState } from 'react';
import { IDEA_THEME_CHOICES, type IdeaDraft, type IdeaTheme, type Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { SuggestionWhy } from './SuggestionWhy';

/** AI-proposed new idea, or a development of an existing one; Review lets the member edit the draft first. */
export function IdeaSuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, applyRecord } = useWorkspace();
  const { ideas } = useSnapshot();
  const topics = ideas.filter((idea) => idea.kind === 'problem');
  const [topicId, setTopicId] = useState(suggestion.topicId ?? (topics.length === 1 ? topics[0]!.id : ''));
  const { toast, toastError } = useFeedback();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const draft = suggestion.ideaDraft;
  const existing = suggestion.ideaId ? ideas.find((i) => i.id === suggestion.ideaId) : undefined;
  const suggestedTopic = topics.find((topic) => topic.id === (suggestion.topicId ?? existing?.topicId));
  const [form, setForm] = useState<IdeaDraft>(draft ?? { title: '', description: '', theme: IDEA_THEME_CHOICES[0] });
  if (!draft) return null;
  const themeChoices: IdeaTheme[] = IDEA_THEME_CHOICES.some((choice) => choice === form.theme)
    ? [...IDEA_THEME_CHOICES]
    : [...IDEA_THEME_CHOICES, form.theme];

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
    run(
      async () => {
        await api.updateSuggestion(projectId, suggestion.id, { ideaDraft: form });
        return api.approveSuggestion(projectId, suggestion.id, topicId ? { topicId } : {});
      },
      suggestion.ideaId ? 'Idea updated' : 'Idea added to Brainstorm',
    );

  return (
    <div className="ai-card idea">
      <span className="ai-badge">
        <Icon name="sparkle" />
        {existing ? `Develop: ${existing.title}` : `New idea: ${draft.title}`}
      </span>
      <p className="meeting-idea-topic">
        <strong>Topic:</strong> {suggestedTopic?.title ?? 'Choose a topic during review'}
      </p>
      <p>{draft.description}</p>
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
        title={existing ? `Develop: ${existing.title}` : 'New idea'}
        eyebrow="AI suggestion"
        onClose={() => setOpen(false)}
        onSubmit={() => void save()}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={busy || !form.title.trim() || (!existing && !topicId)}>
              Save &amp; approve
            </button>
          </>
        }
      >
        {suggestedTopic && (
          <p>
            <strong>Brainstorm topic:</strong> {suggestedTopic.title}
          </p>
        )}
        {!existing && !suggestion.topicId && (
          <label className="form-row">
            Brainstorm topic
            <select value={topicId} onChange={(event) => setTopicId(event.target.value)} required>
              <option value="">Choose a topic first</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </select>
            {!topics.length && <small>Approve a topic before adding ideas to Brainstorm.</small>}
          </label>
        )}
        {!existing && (
          <label className="form-row">
            Title
            <input value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
        )}
        <label className="form-row">
          Description
          <textarea
            maxLength={2000}
            value={form.description}
            rows={4}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        {!existing && (
          <label className="form-row">
            Category
            <select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value as IdeaTheme })}>
              {themeChoices.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        )}
      </Modal>
    </div>
  );
}
