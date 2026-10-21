import { useState } from 'react';
import { PRIORITIES, TASK_LABELS, type Task, type TaskCreateInput } from '@project-room/shared';
import { api } from '../../api/client';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useFeedback } from '../../components/Feedback';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { STATUS_COLUMNS } from './groups';

export type TaskDialogState = { task: Task } | { preset: Partial<Task> } | null;

type Form = Required<Omit<TaskCreateInput, 'assigneeId' | 'dueDate'>> & { assigneeId: string; dueDate: string };

const EMPTY: Form = { title: '', status: 'todo', priority: 'medium', label: 'feature', assigneeId: '', dueDate: '' };

export function TaskDialog({ state, onClose }: { state: TaskDialogState; onClose: () => void }) {
  const { projectId, applyRecord } = useWorkspace();
  const { members } = useSnapshot();
  const { toast, toastError, confirm } = useFeedback();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const editing = state && 'task' in state ? state.task : null;

  // Reset the form whenever the dialog opens for a different task or preset.
  const [formFor, setFormFor] = useState<TaskDialogState>(null);
  if (state !== formFor) {
    setFormFor(state);
    if (state) {
      const source = 'task' in state ? state.task : state.preset;
      setForm({
        ...EMPTY,
        ...Object.fromEntries(Object.entries(source).filter(([k]) => k in EMPTY)),
        assigneeId: source.assigneeId ?? '',
        dueDate: source.dueDate ?? '',
      } as Form);
    }
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const input = { ...form, title: form.title.trim(), assigneeId: form.assigneeId || null, dueDate: form.dueDate || null };
    if (!input.title) return;
    setSaving(true);
    try {
      const task = editing ? await api.updateTask(projectId, editing.id, input) : await api.createTask(projectId, input);
      applyRecord('task', task);
      toast(editing ? `Updated #${task.num}` : `Created #${task.num}`);
      onClose();
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    onClose();
    const ok = await confirm({
      title: 'Delete task?',
      text: `“${editing.title}” (#${editing.num}) will be removed from the board. This can’t be undone.`,
      okLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await api.deleteTask(projectId, editing.id);
      applyRecord('task', editing, true);
      toast('Task deleted');
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <Modal
      open={!!state}
      title={editing ? `Edit task #${editing.num}` : 'New task'}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          {editing && (
            <button type="button" className="btn danger-ghost" onClick={remove}>
              <Icon name="trash" />
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            Save task
          </button>
        </>
      }
    >
      <label>
        Title
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          required
          maxLength={120}
          placeholder="What needs to get done?"
          autoFocus
        />
      </label>
      <div className="form-row">
        <label>
          Status
          <select value={form.status} onChange={(e) => set('status', e.target.value as Form['status'])}>
            {STATUS_COLUMNS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={form.priority} onChange={(e) => set('priority', e.target.value as Form['priority'])}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0]!.toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Assignee
          <select value={form.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <select value={form.label} onChange={(e) => set('label', e.target.value as Form['label'])}>
            {TASK_LABELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Due date
        <input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
      </label>
    </Modal>
  );
}
