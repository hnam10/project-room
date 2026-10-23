import { useState } from 'react';
import type { Poll } from '@project-room/shared';
import { meetingsApi } from '../../api/meetings';
import { useFeedback } from '../../components/Feedback';
import { useSession } from '../../state/session';
import { useWorkspace } from '../../state/workspace';

/** A poll with live counts: click an option to vote (moving is allowed); closed polls are read-only. */
export function PollCard({ poll, onChange }: { poll: Poll; onChange: (poll: Poll) => void }) {
  const { projectId } = useWorkspace();
  const { memberId } = useSession();
  const { toastError, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const open = poll.status === 'open';
  const total = poll.options.reduce((n, o) => n + o.voterIds.length, 0);

  const run = async (action: () => Promise<Poll>) => {
    setBusy(true);
    try {
      onChange(await action());
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="poll-card">
      <strong>{poll.question}</strong>
      {poll.options.map((o) => {
        const mine = o.voterIds.includes(memberId);
        return (
          <button
            key={o.id}
            type="button"
            className={`poll-option${mine ? ' mine' : ''}`}
            disabled={!open || busy}
            aria-pressed={mine}
            onClick={() => void run(() => meetingsApi.vote(projectId, poll.id, o.id))}
          >
            <span className="poll-bar" style={{ width: `${total ? (o.voterIds.length / total) * 100 : 0}%` }} />
            <span className="poll-label">{o.label}</span>
            <span className="poll-count">{o.voterIds.length}</span>
          </button>
        );
      })}
      {open ? (
        <button
          className="btn sm"
          disabled={busy}
          onClick={async () => {
            if (await confirm({ title: 'Close poll', text: 'Close this poll?', okLabel: 'Close poll' }))
              void run(() => meetingsApi.closePoll(projectId, poll.id));
          }}
        >
          Close
        </button>
      ) : (
        <span className="poll-closed">
          Closed · {total} vote{total === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}
