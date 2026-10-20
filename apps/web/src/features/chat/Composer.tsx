import { useRef, useState } from 'react';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';

export function Composer({ channelId }: { channelId: string }) {
  const { projectId, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Icon name="arrow" />
      <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoComplete="off" placeholder="Message @team or @AI…" />
      <button type="button" className="icon-btn round" aria-label="Attach file" onClick={() => toast('File uploads aren’t built yet.')}>
        <Icon name="plus" />
      </button>
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
