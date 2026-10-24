import { useState } from 'react';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';

export function ChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { projectId, applyRecord, setActiveChannelId } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName('');
  }

  const save = async () => {
    if (!name) return;
    setSaving(true);
    try {
      const channel = await api.createChannel(projectId, { name });
      applyRecord('channel', channel);
      setActiveChannelId(channel.id);
      toast(`#${channel.name} created`);
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
      title="Create a channel"
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={!name || saving}>
            {saving ? 'Creating…' : 'Create channel'}
          </button>
        </>
      }
    >
      <label>
        Channel name
        <div className="channel-name-input">
          <span aria-hidden="true">#</span>
          <input
            value={name}
            onChange={(event) =>
              setName(
                event.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]+/g, '-')
                  .replace(/-+/g, '-')
                  .replace(/^-+/, '')
                  .slice(0, 32),
              )
            }
            required
            maxLength={32}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="project-updates"
            autoFocus
          />
        </div>
        <small>Use letters, numbers, and hyphens.</small>
      </label>
    </Modal>
  );
}
