import { useEffect, useState } from 'react';
import type { Member, Task, TaskStatus } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { TaskDialog, type TaskDialogState } from '../board/TaskDialog';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import {
  formatLong,
  relativeDay,
  startOfWeek,
  todayIso,
  weekDays,
  weekRangeLabel,
  weekRelation,
  weekdayShort,
  dayNumber,
} from '../../lib/dates';

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do',
  progress: 'In progress',
  review: 'Review',
  done: 'Done',
};

const PRIORITY_ORDER: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 };

function compareTasks(a: Task, b: Task): number {
  const done = Number(a.status === 'done') - Number(b.status === 'done');
  if (done !== 0) return done;
  const priority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priority !== 0) return priority;
  return a.num - b.num;
}

function weeksToShow(tasks: Task[], deadline: string | null, today: string): string[] {
  const starts = new Set<string>([startOfWeek(today)]);
  for (const task of tasks) {
    if (task.dueDate) starts.add(startOfWeek(task.dueDate));
  }
  if (deadline) starts.add(startOfWeek(deadline));
  return [...starts].sort();
}

function scrollToWeek(start: string) {
  document.getElementById(`week-${start}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function CalendarPage() {
  const { project, tasks } = useSnapshot();
  const { members } = useWorkspace();
  const [dialog, setDialog] = useState<TaskDialogState>(null);
  const [showUndated, setShowUndated] = useState(false);
  const today = todayIso();
  const deadline = project.dueDate;

  useEffect(() => {
    document.title = 'Calendar · Project Room';
    return () => {
      document.title = 'Project Room';
    };
  }, []);

  useEffect(() => {
    document.getElementById(`week-${startOfWeek(today)}`)?.scrollIntoView({ block: 'start' });
  }, [today]);

  const byDay = new Map<string, Task[]>();
  const undated: Task[] = [];
  for (const task of tasks) {
    if (!task.dueDate) {
      undated.push(task);
      continue;
    }
    const list = byDay.get(task.dueDate);
    if (list) list.push(task);
    else byDay.set(task.dueDate, [task]);
  }
  for (const list of byDay.values()) list.sort(compareTasks);
  undated.sort((a, b) => a.num - b.num);

  const weeks = weeksToShow(tasks, deadline, today);
  const datedCount = tasks.length - undated.length;
  const overdue = tasks.filter(
    (task): task is Task & { dueDate: string } => !!task.dueDate && task.dueDate < today && task.status !== 'done',
  );
  const overdueWeek = overdue.map((task) => startOfWeek(task.dueDate)).sort()[0];

  return (
    <div className="page calendar-page">
      <section className="page-head">
        <span className="page-emoji" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <div className="page-title">
          <h1>Calendar</h1>
          <p>{subtitle(datedCount, tasks.length)}</p>
        </div>
      </section>

      <DeadlineBanner deadline={deadline} today={today} onShow={deadline ? () => scrollToWeek(startOfWeek(deadline)) : undefined} />

      {overdueWeek && (
        <div className="calendar-note">
          <Icon name="alert" />
          <span>
            {overdue.length} overdue {overdue.length === 1 ? 'task' : 'tasks'}
          </span>
          <button type="button" className="btn sm" onClick={() => scrollToWeek(overdueWeek)}>
            Show
          </button>
        </div>
      )}

      <div className="calendar-body">
        {weeks.map((start) => (
          <section
            key={start}
            className={`calendar-week${start === startOfWeek(today) ? ' current' : ''}`}
            aria-label={weekRelation(start, today)}
          >
            <header className="calendar-week-head" id={`week-${start}`}>
              <h2>
                {weekRelation(start, today)}
                <span>{weekRangeLabel(start)}</span>
              </h2>
            </header>
            {weekDays(start).map((day) => (
              <DayColumn
                key={day}
                day={day}
                today={today}
                deadline={deadline}
                tasks={byDay.get(day) ?? []}
                members={members}
                onOpen={(task) => setDialog({ task })}
                onAdd={(dueDate) => setDialog({ preset: { dueDate } })}
              />
            ))}
          </section>
        ))}

        {undated.length > 0 && (
          <section className="undated">
            <button type="button" className="undated-toggle" aria-expanded={showUndated} onClick={() => setShowUndated((open) => !open)}>
              <Icon name="chevron" />
              {undated.length} {undated.length === 1 ? 'task has' : 'tasks have'} no due date
            </button>
            {showUndated && (
              <ul className="undated-list">
                {undated.map((task) => (
                  <li key={task.id}>
                    <button type="button" onClick={() => setDialog({ task })}>
                      <span className="num">#{task.num}</span>
                      <span className="undated-title">{task.title}</span>
                      <Avatar member={task.assigneeId ? members.get(task.assigneeId) : undefined} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <TaskDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function subtitle(dated: number, total: number): string {
  if (total === 0) return 'No tasks yet. Add one on a day below.';
  if (dated === 0) return 'No tasks have a due date yet. Open one below to set it, or add a task on a day.';
  return `${dated} ${dated === 1 ? 'task has' : 'tasks have'} a due date, grouped by week.`;
}

function DeadlineBanner({ deadline, today, onShow }: { deadline: string | null; today: string; onShow?: () => void }) {
  if (!deadline) {
    return (
      <div className="deadline-banner">
        <Icon name="flag" />
        <div>
          <strong>No project deadline</strong>
          <p>This project doesn’t have a due date yet.</p>
        </div>
      </div>
    );
  }
  const past = deadline < today;
  return (
    <div className={`deadline-banner${past ? ' past' : ''}`}>
      <Icon name="flag" />
      <div>
        <strong>Project deadline</strong>
        <p>
          {formatLong(deadline)} · {relativeDay(deadline, today)}
        </p>
      </div>
      {onShow && (
        <button type="button" className="btn sm" onClick={onShow}>
          Show that week
        </button>
      )}
    </div>
  );
}

function DayColumn({
  day,
  tasks,
  today,
  deadline,
  members,
  onOpen,
  onAdd,
}: {
  day: string;
  tasks: Task[];
  today: string;
  deadline: string | null;
  members: Map<string, Member>;
  onOpen: (task: Task) => void;
  onAdd: (day: string) => void;
}) {
  const isToday = day === today;
  const isDeadline = day === deadline;
  return (
    <section className={`calendar-day${isToday ? ' today' : ''}`} aria-label={formatLong(day)} aria-current={isToday ? 'date' : undefined}>
      <header className="calendar-day-head">
        <div>
          <span className="dow">{weekdayShort(day)}</span>
          <span className={`dom${isToday ? ' is-today' : ''}`}>{dayNumber(day)}</span>
        </div>
        <button type="button" className="icon-btn small" aria-label={`Add a task due ${formatLong(day)}`} onClick={() => onAdd(day)}>
          <Icon name="plus" />
        </button>
      </header>
      {isDeadline && (
        <p className={`deadline-mark${day < today ? ' past' : ''}`}>
          <Icon name="flag" />
          Project deadline
        </p>
      )}
      <div className="calendar-day-body">
        {tasks.map((task) => {
          const overdue = !!task.dueDate && task.dueDate < today && task.status !== 'done';
          return (
            <button
              key={task.id}
              type="button"
              className={`calendar-task${overdue ? ' overdue' : ''}${task.status === 'done' ? ' done' : ''}`}
              onClick={() => onOpen(task)}
            >
              <span className={`prio prio-${task.priority}`} aria-hidden="true" />
              <span className="calendar-task-title">{task.title}</span>
              <span className="calendar-task-meta">
                <span>#{task.num}</span>
                <span>{STATUS_LABEL[task.status]}</span>
                <Avatar member={task.assigneeId ? members.get(task.assigneeId) : undefined} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
