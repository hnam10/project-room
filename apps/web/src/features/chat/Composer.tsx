import { useRef, useState, type ClipboardEvent } from 'react';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import type { useAttachFiles } from './useAttachFiles';

export function Composer({ channelId, files }: { channelId: string; files: ReturnType<typeof useAttachFiles> }) {
  const { projectId, applyRecord } = useWorkspace();
  const { toastError } = useFeedback();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const pasteFiles = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = [...event.clipboardData.items]
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .map((file) => {
        if (file.name) return file;
        const extension = file.type.split('/')[1] || 'png';
        return new File([file], `pasted-image.${extension}`, { type: file.type });
      });
    if (!pasted.length) return;
    event.preventDefault();
    void files.attach(pasted);
  };

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
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={pasteFiles}
        maxLength={2000}
        autoComplete="off"
        placeholder="Message @team or @AI…"
      />
      <button
        type="button"
        className="icon-btn round"
        aria-label="Attach file"
        disabled={files.attaching}
        onClick={() => picker.current?.click()}
      >
        <Icon name="plus" />
      </button>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])];
          event.target.value = '';
          void files.attach(picked).then(() => input.current?.focus());
        }}
      />
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
