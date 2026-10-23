import type { Member, Task } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { formatShort, todayIso } from '../../lib/dates';

export function TaskCard({ task, assignee, onOpen }: { task: Task; assignee: Member | undefined; onOpen: () => void }) {
  const today = todayIso();
  const overdue = !!task.dueDate && task.dueDate < today && task.status !== 'done';
  const done = task.status === 'done';

  return (
    <article
      className={`task-card${task.sourceKind === 'suggestion' ? ' from-ai' : ''}`}
      draggable
      tabIndex={0}
      aria-label={task.title}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
      }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <h3 className={done ? 'done-title' : ''}>{task.title}</h3>
      <div className="task-side">
        {done ? (
          <span className="done-check" title="Done">
            <Icon name="check" />
          </span>
        ) : (
          <Avatar member={assignee} />
        )}
        <span className="task-num">#{task.num}</span>
      </div>
      <div className="task-tags">
        <span className={`tag ${task.label}`}>{task.label}</span>
        <span className={`tag ${task.priority}`}>{task.priority}</span>
        {task.dueDate && (
          <span className={`task-due${overdue ? ' overdue' : ''}`}>
            {overdue ? 'Overdue · ' : ''}
            {formatShort(task.dueDate)}
          </span>
        )}
      </div>
    </article>
  );
}
