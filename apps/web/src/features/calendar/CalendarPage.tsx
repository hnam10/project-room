import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Member, Task, TaskStatus } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { api } from '../../api/client';
import { TaskDialog, type TaskDialogState } from '../board/TaskDialog';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import {
  dayNumber,
  daysBetween,
  formatLong,
  parseIsoDate,
  relativeDay,
  startOfWeek,
  todayIso,
  weekDays,
  weekRangeLabel,
  weekRelation,
  weekdayShort,
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

function weeksToShow(tasks: Task[], deadline: string | null, today: string, cursor: string): string[] {
  const starts = new Set<string>([startOfWeek(today), startOfWeek(cursor)]);
  for (const task of tasks) {
    if (task.dueDate) starts.add(startOfWeek(task.dueDate));
  }
  if (deadline) starts.add(startOfWeek(deadline));
  return [...starts].sort();
}

function isWeekend(iso: string): boolean {
  const weekday = parseIsoDate(iso).getDay();
  return weekday === 0 || weekday === 6;
}

export function CalendarPage() {
  const { project, tasks } = useSnapshot();
  const { projectId, members, applyProject } = useWorkspace();
  const { toastError } = useFeedback();
  const [dialog, setDialog] = useState<TaskDialogState>(null);
  const today = todayIso();
  const [cursor, setCursor] = useState(today);
  const deadline = project.dueDate;
  const deadlineSaving = useRef(false);
  const [savingDeadline, setSavingDeadline] = useState(false);

  useEffect(() => {
    document.title = 'Calendar · Project Room';
    return () => {
      document.title = 'Project Room';
    };
  }, []);

  useLayoutEffect(() => {
    document.getElementById(`week-${startOfWeek(cursor)}`)?.scrollIntoView({ block: 'start' });
  }, [cursor]);

  function focusDate(iso: string) {
    setCursor(iso);
  }

  async function saveDeadline(dueDate: string | null) {
    if (deadlineSaving.current) return;
    if (dueDate === deadline) {
      if (dueDate) focusDate(dueDate);
      return;
    }
    deadlineSaving.current = true;
    setSavingDeadline(true);
    const previous = deadline;
    applyProject({ ...project, dueDate });
    if (dueDate) focusDate(dueDate);
    try {
      applyProject(await api.updateProject(projectId, { dueDate }));
    } catch (error) {
      applyProject({ ...project, dueDate: previous });
      toastError(error);
    } finally {
      deadlineSaving.current = false;
      setSavingDeadline(false);
    }
  }

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

  const showRail = undated.length > 0;
  const weekStarts = weeksToShow(tasks, deadline, today, cursor);
  const thisWeek = startOfWeek(today);
  const upcomingWeeks = weekStarts.filter((start) => start >= thisWeek);
  const earlierWeeks = weekStarts.filter((start) => start < thisWeek).reverse();
  const overdue = tasks.filter(
    (task): task is Task & { dueDate: string } => !!task.dueDate && task.dueDate < today && task.status !== 'done',
  );
  const overdueDate = overdue.map((task) => task.dueDate).sort()[0];

  return (
    <div className="page calendar-page">
      <section className="page-head">
        <span className="page-emoji" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <div className="page-title">
          <h1>Calendar</h1>
        </div>
        <DeadlineCard deadline={deadline} today={today} disabled={savingDeadline} onChange={(dueDate) => void saveDeadline(dueDate)} />
      </section>

      {overdueDate && (
        <div className="calendar-note">
          <Icon name="alert" />
          <span>
            {overdue.length} overdue {overdue.length === 1 ? 'task' : 'tasks'}
          </span>
          <button type="button" className="btn sm" onClick={() => focusDate(overdueDate)}>
            Show
          </button>
        </div>
      )}

      <div className={`calendar-body${showRail ? ' with-rail' : ''}`}>
        <div className="calendar-main">
          <WeekAgenda
            upcoming={upcomingWeeks}
            earlier={earlierWeeks}
            today={today}
            deadline={deadline}
            byDay={byDay}
            members={members}
            onOpen={(task) => setDialog({ task })}
            onAdd={(dueDate) => setDialog({ preset: { dueDate } })}
          />
        </div>

        {showRail && <CalendarRail undated={undated} members={members} onOpen={(task) => setDialog({ task })} />}
      </div>

      <TaskDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function CalendarRail({ undated, members, onOpen }: { undated: Task[]; members: Map<string, Member>; onOpen: (task: Task) => void }) {
  return (
    <aside className="calendar-rail" aria-label="Tasks with no due date">
      <section>
        <h2>No due date</h2>
        <ul className="undated-list">
          {undated.map((task) => (
            <li key={task.id}>
              <button type="button" onClick={() => onOpen(task)}>
                <span className="num">#{task.num}</span>
                <span className="undated-title">{task.title}</span>
                <Avatar member={task.assigneeId ? members.get(task.assigneeId) : undefined} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

type DeadlineTone = 'empty' | 'past' | 'today' | 'soon' | 'later';

function deadlineTone(deadline: string | null, today: string): DeadlineTone {
  if (!deadline) return 'empty';
  const days = daysBetween(today, deadline);
  if (days < 0) return 'past';
  if (days === 0) return 'today';
  if (days <= 7) return 'soon';
  return 'later';
}

function deadlineStatus(deadline: string, today: string): string {
  const text = relativeDay(deadline, today);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDeadline(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function DeadlineCard({
  deadline,
  today,
  disabled,
  onChange,
}: {
  deadline: string | null;
  today: string;
  disabled: boolean;
  onChange: (dueDate: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tone = deadlineTone(deadline, today);

  function openPicker() {
    const input = inputRef.current;
    if (!input || input.disabled) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
    }
  }

  return (
    <section
      className={`deadline-card ${tone}`}
      aria-label="Project deadline"
      aria-busy={disabled}
      onClick={deadline ? undefined : openPicker}
    >
      <div className="deadline-main">
        <span className="deadline-flag" aria-hidden="true">
          <Icon name="flag" />
        </span>
        <span className="deadline-copy">
          <span className="deadline-kicker">Deadline</span>
          {deadline ? (
            <span className="deadline-value">
              {formatDeadline(deadline)}
              <span className="deadline-status">{deadlineStatus(deadline, today)}</span>
            </span>
          ) : (
            <span className="deadline-value">Set a date</span>
          )}
        </span>
        {deadline && (
          <span className="deadline-change" aria-hidden="true">
            <Icon name="calendar" />
          </span>
        )}
        <input
          ref={inputRef}
          type="date"
          disabled={disabled}
          value={deadline ?? ''}
          aria-label={deadline ? 'Change project deadline' : 'Set project deadline'}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </div>
      {deadline && (
        <div className="deadline-actions">
          <button type="button" className="clear" disabled={disabled} aria-label="Clear project deadline" onClick={() => onChange(null)}>
            <Icon name="x" />
          </button>
        </div>
      )}
    </section>
  );
}

function WeekAgenda({
  upcoming,
  earlier,
  today,
  deadline,
  byDay,
  members,
  onOpen,
  onAdd,
}: {
  upcoming: string[];
  earlier: string[];
  today: string;
  deadline: string | null;
  byDay: Map<string, Task[]>;
  members: Map<string, Member>;
  onOpen: (task: Task) => void;
  onAdd: (day: string) => void;
}) {
  const weekProps = { today, deadline, byDay, members, onOpen, onAdd };
  return (
    <div className="agenda">
      {upcoming.map((start) => (
        <WeekSection key={start} start={start} {...weekProps} />
      ))}
      {earlier.length > 0 && (
        <section className="agenda-earlier" aria-label="Earlier weeks">
          <h2>Earlier</h2>
          {earlier.map((start) => (
            <WeekSection key={start} start={start} {...weekProps} />
          ))}
        </section>
      )}
    </div>
  );
}

function WeekSection({
  start,
  today,
  deadline,
  byDay,
  members,
  onOpen,
  onAdd,
}: {
  start: string;
  today: string;
  deadline: string | null;
  byDay: Map<string, Task[]>;
  members: Map<string, Member>;
  onOpen: (task: Task) => void;
  onAdd: (day: string) => void;
}) {
  return (
    <section className={`agenda-week${start === startOfWeek(today) ? ' current' : ''}`} aria-label={weekRelation(start, today)}>
      <header className="agenda-week-head" id={`week-${start}`}>
        <h2>
          {weekRelation(start, today)}
          <span>{weekRangeLabel(start)}</span>
        </h2>
      </header>
      <div className="agenda-days">
        {weekDays(start).map((day) => (
          <AgendaDay
            key={day}
            day={day}
            today={today}
            deadline={deadline}
            tasks={byDay.get(day) ?? []}
            members={members}
            onOpen={onOpen}
            onAdd={onAdd}
          />
        ))}
      </div>
    </section>
  );
}

function AgendaDay({
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
  const pastDeadline = isDeadline && day < today;
  return (
    <section
      className={[
        'agenda-day',
        isToday ? 'today' : '',
        isWeekend(day) ? 'weekend' : '',
        isDeadline ? 'deadline' : '',
        pastDeadline ? 'past' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={formatLong(day)}
      aria-current={isToday ? 'date' : undefined}
    >
      <header className="agenda-day-head">
        <div className="agenda-date">
          <span className="dow">{weekdayShort(day)}</span>
          <span className={`dom${isToday ? ' is-today' : ''}`}>{dayNumber(day)}</span>
        </div>
        <button type="button" className="icon-btn small" aria-label={`Add a task due ${formatLong(day)}`} onClick={() => onAdd(day)}>
          <Icon name="plus" />
        </button>
      </header>
      {isDeadline && (
        <p className={`agenda-flag${pastDeadline ? ' past' : ''}`}>
          <Icon name="flag" />
          Deadline
        </p>
      )}
      <div className="agenda-tasks">
        {tasks.map((task) => {
          const overdue = !!task.dueDate && task.dueDate < today && task.status !== 'done';
          return (
            <button
              key={task.id}
              type="button"
              className={`agenda-task${overdue ? ' overdue' : ''}${task.status === 'done' ? ' done' : ''}`}
              onClick={() => onOpen(task)}
            >
              <span className={`prio prio-${task.priority}`} aria-hidden="true" />
              <span className="agenda-task-title">{task.title}</span>
              <span className="agenda-task-meta">
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
