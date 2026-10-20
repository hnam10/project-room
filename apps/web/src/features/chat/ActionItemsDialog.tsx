import { useEffect, useState } from 'react';
import { PRIORITIES, type ActionItem, type Suggestion } from '@project-room/shared';
import { api } from '../../api/client';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useWorkspace } from '../../state/workspace';

export function ActionItemsDialog({ suggestion, onClose }: { suggestion: Suggestion | null; onClose: () => void }) {
  const { projectId, members, applyRecord } = useWorkspace();
  const { toastError } = useFeedback();
  const [items, setItems] = useState<ActionItem[]>([]);

  useEffect(() => {
    if (suggestion) setItems(suggestion.items.map((i) => ({ ...i })));
  }, [suggestion]);

  const patch = (index: number, change: Partial<ActionItem>) =>
    setItems((list) => list.map((item, i) => (i === index ? { ...item, ...change } : item)));

  const save = async () => {
    if (!suggestion) return;
    try {
      const cleaned = items.map((i) => ({ ...i, title: i.title.trim() || 'Untitled task' }));
      applyRecord('suggestion', await api.updateSuggestion(projectId, suggestion.id, { items: cleaned }));
      onClose();
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <Modal
      open={!!suggestion}
      wide
      eyebrow="AI suggestion"
      title="Review action items"
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save changes
          </button>
        </>
      }
    >
      <p className="modal-note">Nothing is added to the board until you confirm. Uncheck items you don’t want.</p>
      <div className="action-rows">
        {items.map((item, i) => (
          <div key={i} className="action-row">
            <input type="checkbox" checked={item.include} onChange={(e) => patch(i, { include: e.target.checked })} aria-label="Include item" />
            <input value={item.title} maxLength={120} onChange={(e) => patch(i, { title: e.target.value })} aria-label="Task title" />
            <select value={item.assigneeId ?? ''} onChange={(e) => patch(i, { assigneeId: e.target.value || null })} aria-label="Assignee">
              <option value="">Unassigned</option>
              {[...members.values()].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select value={item.priority} onChange={(e) => patch(i, { priority: e.target.value as ActionItem['priority'] })} aria-label="Priority">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </Modal>
  );
}
