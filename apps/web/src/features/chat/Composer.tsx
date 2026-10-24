import { useRef, useState, type ChangeEvent } from 'react';
import { MAX_FILE_BYTES } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';

export function Composer({ channelId }: { channelId: string }) {
  const { projectId, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      applyRecord('message', await api.sendMessage(projectId, channelId, value));
      setText('');
    } catch (error) {
      toastError(error);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };

  const attach = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files;
    const files = picked ? [...picked] : [];
    event.target.value = '';
    if (!files.length || attaching) return;
    setAttaching(true);
    try {
      for (const file of files) {
        if (file.size === 0) {
          toast('Choose a file to upload');
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast(`${file.name} is larger than 10 MB`);
          continue;
        }
        try {
          const uploaded = await api.uploadFile(projectId, file);
          applyRecord('file', uploaded);
          applyRecord('message', await api.sendMessage(projectId, channelId, uploaded.name, uploaded.id));
        } catch (error) {
          toastError(error);
        }
      }
    } finally {
      setAttaching(false);
      input.current?.focus();
    }
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Icon name="arrow" />
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        autoComplete="off"
        placeholder="Message @team or @AI…"
      />
      <button
        type="button"
        className="icon-btn round"
        aria-label="Attach file"
        disabled={attaching}
        onClick={() => picker.current?.click()}
      >
        <Icon name="plus" />
      </button>
      <input ref={picker} type="file" multiple hidden onChange={(event) => void attach(event)} />
      <button
        type="button"
        className="icon-btn"
        aria-label="Mention AI"
        onClick={() => {
          if (!/@ai\b/i.test(text)) setText(`@AI ${text}`);
          input.current?.focus();
        }}
      >
        <Icon name="at" />
      </button>
      <button type="submit" className="send-btn" aria-label="Send message" disabled={sending}>
        <Icon name="send" />
      </button>
    </form>
  );
}
