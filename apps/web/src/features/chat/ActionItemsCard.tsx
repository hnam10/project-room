import { useState } from 'react';
import type { Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';
import { ActionItemsDialog } from './ActionItemsDialog';

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** AI-proposed tasks shown under the AI's chat message, with the approve / edit / dismiss workflow. */
export function ActionItemsCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, members, applyRecord } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<Suggestion>, done: (s: Suggestion) => string) => {
    setBusy(true);
    try {
      const updated = await action();
      applyRecord('suggestion', updated);
      toast(done(updated));
    } catch (error) {
      toastError(error);
    } finally {
      setBusy(false);
    }
  };

  const added = suggestion.createdTaskIds.length;

  return (
    <>
      <div className="action-card">
        {suggestion.items.map((item, i) => (
          <div key={i} className={`action-item${item.include ? '' : ' off'}`}>
            <span className="check">
              <Icon name={item.include ? 'check' : 'x'} />
            </span>
            <span>{item.title}</span>
            <span className="action-owner">
              <Icon name="arrow" />
              {item.assigneeId ? (members.get(item.assigneeId)?.name ?? 'Unknown') : 'Unassigned'}
            </span>
            <span className={`action-prio ${item.priority}`}>({cap(item.priority)})</span>
            {(item.reason || item.quote) && (
              <div className="action-why">
                {item.reason && <span>{item.reason}</span>}
                {item.quote && <q>{item.quote}</q>}
              </div>
            )}
          </div>
        ))}
      </div>

      {suggestion.status === 'approved' && (
        <span className="action-result approved">
          <Icon name="check" />
          Added {added} task{added === 1 ? '' : 's'} to the board
        </span>
      )}
      {suggestion.status === 'dismissed' && <span className="action-result dismissed">Dismissed</span>}
      {suggestion.status === 'pending' && (
        <>
          <p className="action-question">Would you like to add these to the board?</p>
          <div className="action-buttons">
            <button
              className="btn success sm"
              disabled={busy}
              onClick={() =>
                run(
                  () => api.approveSuggestion(projectId, suggestion.id),
                  (s) => `Added ${s.createdTaskIds.length} task${s.createdTaskIds.length === 1 ? '' : 's'} to To Do`,
                )
              }
            >
              <Icon name="check" />
              Add to Board
            </button>
            <button className="btn sm" disabled={busy} onClick={() => setEditing(true)}>
              <Icon name="pencil" />
              Edit
            </button>
            <button
              className="btn sm"
              disabled={busy}
              onClick={() =>
                run(
                  () => api.dismissSuggestion(projectId, suggestion.id),
                  () => 'Suggestion dismissed',
                )
              }
            >
              <Icon name="x" />
              Dismiss
            </button>
          </div>
        </>
      )}

      <ActionItemsDialog suggestion={editing ? suggestion : null} onClose={() => setEditing(false)} />
    </>
  );
}
