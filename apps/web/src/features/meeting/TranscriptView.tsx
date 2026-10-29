import { useEffect, useRef, useState } from 'react';
import { AI_AUTHOR, type TranscriptLine } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useWorkspace } from '../../state/workspace';
import { memberDisplayName, useClerkIdentities } from '../account/clerkIdentityContext';
import { FileChip } from '../chat/MessageList';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Transcript with auto-scroll; `interim` is the caller's own in-progress speech (grey, local only).
 * "Chat only" hides spoken lines on screen; the meeting AI still reads everything.
 */
export function TranscriptView({ lines: all, interim: speaking }: { lines: TranscriptLine[]; interim: string }) {
  const { projectId, members } = useWorkspace();
  const identities = useClerkIdentities();
  const text = (l: TranscriptLine) => (l.fileId ? <FileChip projectId={projectId} fileId={l.fileId} name={l.text} /> : l.text);
  const box = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [chatOnly, setChatOnly] = useState(false);
  const lines = chatOnly ? all.filter((l) => l.source === 'chat' || l.source === 'ai') : all;
  const interim = chatOnly ? '' : speaking;

  const toEnd = () => box.current?.scrollTo({ top: box.current.scrollHeight });
  useEffect(() => {
    if (pinned) toEnd();
  }, [lines.length, interim, pinned, chatOnly]);

  return (
    <div className="transcript-wrap">
      <label className="t-filter">
        <input type="checkbox" checked={chatOnly} onChange={(e) => setChatOnly(e.target.checked)} />
        Chat only
      </label>
      <div
        className="transcript"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        {lines.length === 0 && !interim && (
          <p className="empty-state">
            {chatOnly ? 'No chat messages yet.' : 'Nothing said yet. Speak or type and your words appear here.'}
          </p>
        )}
        {lines.map((l, i) =>
          // Consecutive lines from the same speaker and source (spoken, typed, or an @AI reply) read as one turn.
          lines[i - 1]?.speakerId === l.speakerId && (lines[i - 1]?.source ?? 'voice') === (l.source ?? 'voice') ? (
            <p className="t-more" key={l.id} title={time(l.spokenAt)}>
              {text(l)}
            </p>
          ) : (
            <div className="t-line" key={l.id}>
              {l.source === 'ai' ? <Avatar id={AI_AUTHOR} /> : <Avatar member={members.get(l.speakerId)} />}
              <div>
                <b>{l.source === 'ai' ? 'AI' : memberDisplayName(identities, l.speakerId, members.get(l.speakerId)?.name, 'Unknown')}</b>{' '}
                {l.source === 'chat' && (
                  <span className="t-chat">
                    <Icon name="message" /> chat
                  </span>
                )}{' '}
                <time>{time(l.spokenAt)}</time>
                <p>{text(l)}</p>
              </div>
            </div>
          ),
        )}
        {interim && <p className="t-interim">{interim}…</p>}
      </div>
      {!pinned && (
        <button className="btn sm jump" onClick={() => setPinned(true)}>
          Jump to latest
        </button>
      )}
    </div>
  );
}
