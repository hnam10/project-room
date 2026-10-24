import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { AI_AUTHOR, type Message } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { ActionItemsCard } from './ActionItemsCard';

const MENTION = /(@(?:AI|team|alex|jamie|taylor|morgan)\b)/gi;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function FileChip({ projectId, fileId, name }: { projectId: string; fileId: string; name: string }) {
  const { toastError } = useFeedback();
  const save = async () => {
    try {
      const blob = await api.downloadFile(projectId, fileId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toastError(error);
    }
  };
  return (
    <button type="button" className="msg-file" aria-label={`Download ${name}`} onClick={() => void save()}>
      <Icon name="file" />
      <span>{name}</span>
    </button>
  );
}

function MessageText({ text }: { text: string }) {
  return (
    <>
      {text.split(MENTION).map((part, i) =>
        i % 2 ? (
          <span key={i} className="mention">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function MessageList({ channelId, scrollRef }: { channelId: string; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { projectId, messages, loadMessages, members } = useWorkspace();
  const { suggestions, files } = useSnapshot();
  const { toastError } = useFeedback();
  const list = messages(channelId);
  const lastId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!list) loadMessages(channelId).catch(toastError);
  }, [channelId, list, loadMessages, toastError]);

  // Stick to the bottom when a new message arrives.
  useLayoutEffect(() => {
    const newest = list?.at(-1)?.id;
    if (newest && newest !== lastId.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    lastId.current = newest;
  }, [list, scrollRef]);

  if (!list) return <div className="empty-state">Loading messages…</div>;
  if (!list.length) return <div className="empty-state">No messages yet. Say hi to your team.</div>;

  return (
    <div className="messages">
      {list.map((m: Message) => {
        const member = members.get(m.authorId);
        const suggestion = m.suggestionId ? suggestions.find((s) => s.id === m.suggestionId) : undefined;
        return (
          <div key={m.id} className="msg">
            <time dateTime={m.createdAt}>{time(m.createdAt)}</time>
            {m.authorId === AI_AUTHOR ? (
              <span className="msg-author ai">
                <span className="ai-badge">
                  <Icon name="sparkle" />
                </span>
                AI
              </span>
            ) : (
              <span className="msg-author" style={{ '--c': member?.color } as React.CSSProperties}>
                {member?.name ?? 'Former member'}
              </span>
            )}
            <span className="msg-text">
              {m.fileId ? (
                <FileChip projectId={projectId} fileId={m.fileId} name={files.find((file) => file.id === m.fileId)?.name ?? m.text} />
              ) : (
                <MessageText text={m.text} />
              )}
            </span>
            {suggestion && (
              <div className="msg-extra">
                <ActionItemsCard suggestion={suggestion} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
