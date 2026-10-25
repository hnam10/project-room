import { useRef, useState } from 'react';
import { meetingsApi } from '../../api/meetings';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import type { useAttachFiles } from '../chat/useAttachFiles';

/**
 * Typed messages join the transcript as chat lines, so the meeting AI and the summary read them like speech.
 * Shared files join as chat lines too, and the meeting AI reads passages from them.
 */
export function MeetingChat({ meetingId, files }: { meetingId: string; files: ReturnType<typeof useAttachFiles> }) {
  const { projectId } = useWorkspace();
  const { toastError } = useFeedback();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      // The line arrives through realtime like spoken lines do.
      await meetingsApi.postLine(projectId, meetingId, value, 'chat');
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
      className="composer meeting-chat"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <Icon name="message" />
      <input
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        autoComplete="off"
        aria-label="Message the meeting"
        placeholder="Message the meeting or @AI…"
      />
      <button
        type="button"
        className="icon-btn round"
        aria-label="Share a file"
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
      <button type="submit" className="send-btn" aria-label="Send message" disabled={sending}>
        <Icon name="send" />
      </button>
    </form>
  );
}
