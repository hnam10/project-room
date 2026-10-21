import { useState } from 'react';
import { IDEA_THEMES, type IdeaTheme } from '@project-room/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';

export function IdeaDialog({ open, defaultTheme, onClose }: { open: boolean; defaultTheme: IdeaTheme; onClose: () => void }) {
  const { projectId, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState<IdeaTheme>(defaultTheme);

  // Start empty each time the dialog opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle('');
      setDescription('');
      setTheme(defaultTheme);
    }
  }

  const save = async () => {
    if (!title.trim()) return;
    try {
      applyRecord('idea', await api.createIdea(projectId, { title: title.trim(), description: description.trim(), theme }));
      toast('Idea added');
      onClose();
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <Modal
      open={open}
      title="Add idea"
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Add idea
          </button>
        </>
      }
    >
      <label>
        Idea
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder="What if we…" autoFocus />
      </label>
      <label>
        Details
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={240}
          placeholder="What problem does it solve?"
        />
      </label>
      <label>
        Theme
        <select value={theme} onChange={(e) => setTheme(e.target.value as IdeaTheme)}>
          {IDEA_THEMES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
    </Modal>
  );
}
