import { useState } from 'react';
import type { Task } from '@project-room/shared';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import { api } from '../../api/client';
import { columnOf, columnsFor, patchForColumn, type GroupBy } from './groups';
import { TaskCard } from './TaskCard';

export function TaskBoard(props: {
  boardRef?: React.Ref<HTMLElement>;
  tasks: Task[];
  groupBy: GroupBy;
  emptyText: string;
  onOpenTask: (task: Task) => void;
  onAddTask: (preset: Partial<Task>) => void;
}) {
  const { projectId, members, applyRecord } = useWorkspace();
  const snapshot = useSnapshot();
  const { toast, toastError } = useFeedback();
  const [dropColumn, setDropColumn] = useState<string | null>(null);
  const columns = columnsFor(props.groupBy, snapshot.members);

  const moveTask = async (taskId: string, columnId: string) => {
    const task = snapshot.tasks.find((t) => t.id === taskId);
    if (!task || columnOf(task, props.groupBy) === columnId) return;
    const patch = patchForColumn(props.groupBy, columnId);
    applyRecord('task', { ...task, ...patch }); // optimistic; the server echo replaces it
    try {
      applyRecord('task', await api.updateTask(projectId, task.id, patch));
      toast(`#${task.num} moved to ${columns.find((c) => c.id === columnId)?.label}`);
    } catch (error) {
      applyRecord('task', task);
      toastError(error);
    }
  };

  return (
    <section ref={props.boardRef} className="board" aria-label="Task board">
      {columns.map((col) => {
        const items = props.tasks.filter((t) => columnOf(t, props.groupBy) === col.id);
        return (
          <section
            key={col.id}
            className={`column${dropColumn === col.id ? ' drop-target' : ''}`}
            style={{ '--col': col.color } as React.CSSProperties}
            onDragOver={(e) => {
              e.preventDefault();
              setDropColumn(col.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropColumn(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDropColumn(null);
              void moveTask(e.dataTransfer.getData('text/plain'), col.id);
            }}
          >
            <header className="column-head">
              <span className="column-dot" />
              {col.label}
              <span className="column-count">{items.length}</span>
            </header>
            <div className="column-body">
              {items.length ? (
                items.map((t) => (
                  <TaskCard key={t.id} task={t} assignee={t.assigneeId ? members.get(t.assigneeId) : undefined} onOpen={() => props.onOpenTask(t)} />
                ))
              ) : (
                <div className="column-empty">{props.emptyText}</div>
              )}
            </div>
            <button className="add-in-column" onClick={() => props.onAddTask(patchForColumn(props.groupBy, col.id))}>
              <Icon name="plus" />
              Add task
            </button>
          </section>
        );
      })}
    </section>
  );
}
