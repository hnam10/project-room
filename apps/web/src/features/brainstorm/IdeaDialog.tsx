import { useState } from 'react';
import type { Idea } from '@project-room/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import { StrategyEditor } from './StrategyEditor';

export function IdeaDialog({
  open,
  kind = 'idea',
  idea,
  topicId,
  onSaved,
  onClose,
}: {
  open: boolean;
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
  const theme = idea?.theme ?? 'Option';

  // Start empty each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle(idea?.title ?? '');
      setDescription(idea?.description ?? '');
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
      {theme === 'Strategy' && kind !== 'problem' ? (
        <StrategyEditor description={description} onChange={setDescription} />
      ) : (
        <label>
          Details
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={240}
            placeholder={kind === 'problem' ? 'Add any context or constraints.' : 'Add any useful details or reasons.'}
          />
        </label>
      )}
    </Modal>
  );
}
