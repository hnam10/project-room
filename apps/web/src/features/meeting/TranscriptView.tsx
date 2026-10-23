import { useEffect, useRef, useState } from 'react';
import type { TranscriptLine } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { useWorkspace } from '../../state/workspace';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Transcript with auto-scroll; `interim` is the caller's own in-progress speech (grey, local only). */
export function TranscriptView({ lines, interim }: { lines: TranscriptLine[]; interim: string }) {
  const { members } = useWorkspace();
  const box = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  const toEnd = () => box.current?.scrollTo({ top: box.current.scrollHeight });
  useEffect(() => {
    if (pinned) toEnd();
  }, [lines.length, interim, pinned]);

  return (
    <div className="transcript-wrap">
      <div
        className="transcript"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        {lines.length === 0 && !interim && <p className="empty-state">Nothing said yet. Speak and your words appear here.</p>}
        {lines.map((l, i) =>
          // Consecutive lines from the same speaker read as one turn.
          lines[i - 1]?.speakerId === l.speakerId ? (
            <p className="t-more" key={l.id} title={time(l.spokenAt)}>
              {l.text}
            </p>
          ) : (
            <div className="t-line" key={l.id}>
              <Avatar member={members.get(l.speakerId)} />
              <div>
                <b>{members.get(l.speakerId)?.name ?? 'Unknown'}</b> <time>{time(l.spokenAt)}</time>
                <p>{l.text}</p>
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
