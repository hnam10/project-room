import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Task } from '@project-room/shared';
import { Icon } from '../components/Icon';
import { Dock } from '../features/dock/Dock';
import { TaskBoard } from '../features/board/TaskBoard';
import { TaskDialog, type TaskDialogState } from '../features/board/TaskDialog';
import type { GroupBy } from '../features/board/groups';
import { useSnapshot } from '../state/workspace';

export function BoardPage() {
  const { project, tasks, members } = useSnapshot();
  const [params, setParams] = useSearchParams();
  const [groupBy, setGroupBy] = useState<GroupBy>('status');
  const [assignee, setAssignee] = useState<string>('all');
  const [dialog, setDialog] = useState<TaskDialogState>(null);
  const boardRef = useRef<HTMLElement>(null);

  const visible = tasks.filter((t) => assignee === 'all' || (t.assigneeId ?? '') === assignee).sort((a, b) => a.num - b.num);

  // `?task=<id>` (set by the top-bar search) opens that task; closing the dialog clears it.
  const openTaskId = params.get('task');
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (openTaskId !== openedFor) {
    setOpenedFor(openTaskId);
    const task = openTaskId && tasks.find((t) => t.id === openTaskId);
    if (task) setDialog({ task });
  }
  const closeDialog = () => {
    setDialog(null);
    if (openTaskId) {
      setParams(
        (p) => {
          p.delete('task');
          return p;
        },
        { replace: true },
      );
    }
  };

  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="page">
      <section className="page-head">
        <span className="page-emoji" aria-hidden="true">
          {project.emoji}
        </span>
        <div className="page-title">
          <h1>{project.name}</h1>
          <p>{project.description}</p>
        </div>
        <div className="progress">
          <small>
            {done}/{tasks.length} tasks
          </small>
          <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span>{pct}%</span>
        </div>
        <div className="head-actions">
          <label className="select-btn">
            <Icon name="filter" />
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Filter by assignee">
              <option value="all">Filter: Everyone</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value="">Unassigned</option>
            </select>
          </label>
          <label className="select-btn">
            <span className="select-prefix">Group by:</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Group tasks by">
              <option value="status">Status</option>
              <option value="priority">Priority</option>
              <option value="assigneeId">Assignee</option>
            </select>
          </label>
          <button className="btn primary" onClick={() => setDialog({ preset: {} })}>
            <Icon name="plus" />
            Add Task
          </button>
        </div>
      </section>

      <TaskBoard
        boardRef={boardRef}
        tasks={visible}
        groupBy={groupBy}
        emptyText="Drop tasks here"
        onOpenTask={(task: Task) => setDialog({ task })}
        onAddTask={(preset) => setDialog({ preset })}
      />
      <Dock boardRef={boardRef} />
      <TaskDialog state={dialog} onClose={closeDialog} />
    </div>
  );
}
