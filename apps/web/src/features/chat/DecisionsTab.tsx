import { api } from '../../api/client';
import { Avatar } from '../../components/Avatar';
import { useFeedback } from '../../components/Feedback';
import { useSnapshot, useWorkspace } from '../../state/workspace';

const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function DecisionsTab() {
  const { projectId, members, applyRecord } = useWorkspace();
  const { decisions } = useSnapshot();
  const { confirm, toastError } = useFeedback();

  const decide = async (id: string, title: string) => {
    const ok = await confirm({
      title: 'Mark as decided?',
      text: `“${title}” will be recorded as an official team decision.`,
      okLabel: 'Mark decided',
    });
    if (!ok) return;
    try {
      applyRecord('decision', await api.decide(projectId, id));
    } catch (error) {
      toastError(error);
    }
  };

  const sorted = [...decisions].sort((a, b) =>
    a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === 'open' ? -1 : 1,
  );

  return (
    <div className="list-pad">
      {sorted.length ? (
        sorted.map((d) => {
          const by = members.get(d.status === 'decided' ? (d.decidedById ?? d.raisedById) : d.raisedById);
          return (
            <div key={d.id} className="decision">
              <Avatar member={by} />
              <div>
                <strong>{d.title}</strong>
                <span className="sub">
                  {d.status === 'decided' ? 'Decided' : 'Raised'} by {by?.name ?? 'someone'} · {date(d.decidedAt ?? d.createdAt)}
                </span>
              </div>
              {d.status === 'decided' ? (
                <span className="status-pill decided">Decided</span>
              ) : (
                <button className="btn sm" onClick={() => decide(d.id, d.title)}>
                  Mark decided
                </button>
              )}
            </div>
          );
        })
      ) : (
        <div className="empty-state">No decisions recorded yet.</div>
      )}
    </div>
  );
}
