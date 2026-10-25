import { useSnapshot, useWorkspace } from '../../state/workspace';
import { PollCard } from '../polls/PollCard';

/** Every poll opened in a meeting: open ones first (vote or close them here), then closed ones with their result. */
export function PollsTab() {
  const { applyRecord } = useWorkspace();
  const { polls } = useSnapshot();
  const sorted = [...polls].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'open' ? -1 : 1));

  return (
    <div className="list-pad">
      {sorted.length ? (
        sorted.map((poll) => <PollCard key={poll.id} poll={poll} onChange={(updated) => applyRecord('poll', updated)} />)
      ) : (
        <div className="empty-state">No polls yet. Polls opened in a meeting appear here.</div>
      )}
    </div>
  );
}
