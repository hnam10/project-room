import { useState } from 'react';
import { IDEA_THEME_CHOICES, STRATEGY_DESCRIPTION_MAX, type Idea, type IdeaTheme } from '@project-room/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';

export function IdeaDialog({
  open,
  defaultTheme,
  kind = 'idea',
  idea,
  topicId,
  onSaved,
  onClose,
}: {
  open: boolean;
  defaultTheme: IdeaTheme;
  kind?: 'problem' | 'idea';
  idea?: Idea | null;
  topicId?: string;
  onSaved?: (idea: Idea) => void;
  onClose: () => void;
}) {
  const { projectId, applyRecord, reload } = useWorkspace();
  const { toast, toastError, confirm } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState<IdeaTheme>(defaultTheme);
  const themeChoices: IdeaTheme[] = IDEA_THEME_CHOICES.some((choice) => choice === theme)
    ? [...IDEA_THEME_CHOICES]
    : [...IDEA_THEME_CHOICES, theme];

  // Start empty each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(idea?.title ?? '');
      setDescription(idea?.description ?? '');
      setTheme(idea?.theme ?? defaultTheme);
    }
  }

  const save = async () => {
    if (!title.trim() || saving) return;
    if (
      idea &&
      kind === 'problem' &&
      (title.trim() !== idea.title || description.trim() !== idea.description) &&
      !(await confirm({
        title: 'Change topic and clear its board?',
        text: 'This clears all ideas, research, strategies and pending drafts for this topic. Other topics and tasks already on the task board stay in place.',
        okLabel: 'Change and clear',
      }))
    )
      return;
    setSaving(true);
    try {
      const saved = idea
        ? await api.updateIdea(projectId, idea.id, { title: title.trim(), description: description.trim(), theme })
        : await api.createIdea(projectId, { title: title.trim(), description: description.trim(), theme, kind, topicId });
      applyRecord('idea', saved);
      if (kind === 'problem') reload();
      onSaved?.(saved);
      toast(idea ? 'Updated' : kind === 'problem' ? 'Topic added' : 'Idea added');
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={idea ? (kind === 'problem' ? 'Edit brainstorm topic' : 'Edit idea') : kind === 'problem' ? 'Set brainstorm topic' : 'Add idea'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`btn ${kind === 'problem' ? 'primary' : 'idea-btn'}`} disabled={saving || !title.trim()}>
            {idea ? 'Save changes' : kind === 'problem' ? 'Set topic' : 'Add idea'}
          </button>
        </>
      }
    >
      <label>
        {kind === 'problem' ? 'Question or problem' : 'Idea'}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={80}
          placeholder={kind === 'problem' ? 'What are we deciding or solving?' : 'What do you suggest?'}
          autoFocus
        />
      </label>
      <label>
        Details
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={theme === 'Strategy' && kind !== 'problem' ? 14 : 3}
          maxLength={theme === 'Strategy' && kind !== 'problem' ? STRATEGY_DESCRIPTION_MAX : 240}
          placeholder={kind === 'problem' ? 'Add any context or constraints.' : 'Add any useful details or reasons.'}
        />
      </label>
      {kind === 'idea' && (
        <label>
          Category
          <select value={theme} onChange={(e) => setTheme(e.target.value as IdeaTheme)}>
            {themeChoices.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      )}
    </Modal>
  );
}
