import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { Member, Task, TaskStatus } from '@project-room/shared';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useFeedback } from '../../components/Feedback';
import { api } from '../../api/client';
import { TaskDialog, type TaskDialogState } from '../board/TaskDialog';
import { useSnapshot, useWorkspace } from '../../state/workspace';
import {
  addDays,
  dayNumber,
  daysBetween,
  formatLong,
  formatShort,
  parseIsoDate,
  relativeDay,
  startOfWeek,
  todayIso,
  weekDays,
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

/** Weeks rendered ahead of this week on first paint; more load when you scroll near the bottom. */
const INITIAL_FUTURE_WEEKS = 4;
/** Bound automatic padding from dates; scrolling can still extend the range. */
const MAX_AUTO_WEEKS = 52;
/** How many weeks to add when the scroll reaches either end. */
const WEEK_PAGE = 6;
/** Minimum height of a week row in the scroll area. */
const MIN_WEEK_ROW_HEIGHT = 148;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function weekSpan(thisWeek: string, pastCount: number, futureCount: number): string[] {
  return Array.from({ length: pastCount + futureCount + 1 }, (_, index) => addDays(thisWeek, (index - pastCount) * 7));
}

function weeksFromToday(thisWeek: string, iso: string): number {
  return Math.round(daysBetween(thisWeek, startOfWeek(iso)) / 7);
}

function isWeekend(iso: string): boolean {
  const weekday = parseIsoDate(iso).getDay();
  return weekday === 0 || weekday === 6;
}

function formatMonthYear(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function monthAnchor(weekStart: string, today: string): string {
  const days = weekDays(weekStart);
  if (days.includes(today)) return today;
  const firstInWeek = days.find((day) => dayNumber(day) === 1);
  return firstInWeek ?? addDays(weekStart, 3);
}

function monthForWeek(weekStart: string, today: string): string {
  return formatMonthYear(monthAnchor(weekStart, today));
}

function requiredWeekPadding(thisWeek: string, cursor: string, deadline: string | null, tasks: Task[]): { past: number; future: number } {
  let past = 0;
  let future = INITIAL_FUTURE_WEEKS;
  const note = (iso: string | null) => {
    if (!iso) return;
    const delta = Math.max(-MAX_AUTO_WEEKS, Math.min(MAX_AUTO_WEEKS, weeksFromToday(thisWeek, iso)));
    if (delta > future) future = delta;
    if (delta < 0 && -delta > past) past = -delta;
  };
  note(cursor);
  note(deadline);
  for (const task of tasks) note(task.dueDate);
  return { past, future };
}

export function CalendarPage() {
  const { project, tasks } = useSnapshot();
  const { projectId, members, applyProject, applyRecord, isRecordRemoved } = useWorkspace();
  const { toast, toastError } = useFeedback();
  const [dialog, setDialog] = useState<TaskDialogState>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const today = todayIso();
  const [cursor, setCursor] = useState(today);
  const viewDate = useRef(today);
  const [scrollPast, setScrollPast] = useState(0);
  const [scrollFuture, setScrollFuture] = useState(INITIAL_FUTURE_WEEKS);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(startOfWeek(today));
  const userScrolled = useRef(false);
  const scrollLock = useRef(false);
  const prependHeight = useRef<number | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const deadline = project.dueDate;
  const deadlineSaving = useRef(false);
  const pendingTaskUpdates = useRef(new Map<string, symbol>());
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [headMonth, setHeadMonth] = useState(() => monthForWeek(startOfWeek(todayIso()), todayIso()));

  useEffect(() => {
    const pending = pendingTaskUpdates.current;
    document.title = 'Calendar · Project Room';
    return () => {
      pending.clear();
      document.title = 'Project Room';
    };
  }, []);

  const thisWeek = startOfWeek(today);
  const required = requiredWeekPadding(thisWeek, cursor, deadline, tasks);
  const pastCount = Math.max(scrollPast, required.past);
  const futureCount = Math.max(scrollFuture, required.future);

  useLayoutEffect(() => {
    const week = pendingFocus.current;
    const el = scrollerRef.current;
    if (!week || !el) return;
    const node = document.getElementById(`week-${week}`);
    pendingFocus.current = '';
    if (!node) return;
    const header = el.querySelector('.agenda-dow');
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 0;
    const top = node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - headerHeight;
    el.scrollTop = Math.max(0, top);
  }, [pastCount, futureCount, cursor, focusKey]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const previousHeight = prependHeight.current;
    prependHeight.current = null;
    if (el && previousHeight != null) el.scrollTop += el.scrollHeight - previousHeight;
    scrollLock.current = false;
  }, [pastCount, futureCount]);

  const syncHeadMonth = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const header = el.querySelector('.agenda-dow');
    const headerHeight = header instanceof HTMLElement ? header.offsetHeight : 36;
    const anchor = el.getBoundingClientRect().top + headerHeight + 8;
    let weekStart: string | null = null;
    for (const block of el.querySelectorAll<HTMLElement>('.agenda-week-block')) {
      const id = block.querySelector('.agenda-week')?.id;
      if (!id?.startsWith('week-')) continue;
      const start = id.slice(5);
      if (block.getBoundingClientRect().top <= anchor) weekStart = start;
    }
    if (weekStart) {
      viewDate.current = monthAnchor(weekStart, today);
      const next = formatMonthYear(viewDate.current);
      setHeadMonth((current) => (current === next ? current : next));
    }
  }, [today]);

  useLayoutEffect(() => {
    syncHeadMonth();
  }, [pastCount, futureCount, syncHeadMonth]);

  function focusDate(iso: string) {
    pendingFocus.current = startOfWeek(iso);
    setCursor(iso);
    setFocusKey((k) => k + 1);
  }

  function stepMonth(delta: number) {
    const base = parseIsoDate(viewDate.current);
    const target = new Date(base.getFullYear(), base.getMonth() + delta, 1);
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-01`;
    const week = startOfWeek(iso);
    // A month can start in this week while its label still belongs to today's month.
    focusDate(monthForWeek(week, today) === formatMonthYear(iso) ? iso : addDays(week, 7));
  }

  function onCalendarScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    syncHeadMonth();
    if (scrollLock.current) return;
    const row = el.querySelector<HTMLElement>('.agenda-week-block');
    const rowStep = row?.offsetHeight ?? MIN_WEEK_ROW_HEIGHT;
    if (el.scrollTop > 24) userScrolled.current = true;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (el.scrollTop > rowStep && remaining < rowStep) {
      scrollLock.current = true;
      setScrollFuture(futureCount + WEEK_PAGE);
      return;
    }
    if (userScrolled.current && el.scrollTop < rowStep) {
      scrollLock.current = true;
      prependHeight.current = el.scrollHeight;
      setScrollPast(pastCount + WEEK_PAGE);
    }
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

  async function assignDueDate(taskId: string, dueDate: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.dueDate === dueDate || isRecordRemoved('task', taskId)) return;
    const request = Symbol();
    pendingTaskUpdates.current.set(task.id, request);
    const optimisticTask: Task = { ...task, dueDate };
    applyRecord('task', optimisticTask);
    try {
      const saved = await api.updateTask(projectId, task.id, { dueDate });
      if (pendingTaskUpdates.current.get(task.id) !== request || isRecordRemoved('task', task.id)) return;
      applyRecord('task', saved);
      toast(`#${task.num} due ${formatShort(dueDate)}`);
    } catch (error) {
      if (pendingTaskUpdates.current.get(task.id) !== request || isRecordRemoved('task', task.id)) return;
      applyRecord('task', task);
      toastError(error);
    } finally {
      if (pendingTaskUpdates.current.get(task.id) === request) pendingTaskUpdates.current.delete(task.id);
    }
  }

  function dragOverDay(day: string, event: DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropDay(day);
  }

  function dragLeaveDay(day: string, event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setDropDay((current) => (current === day ? null : current));
  }

  function dropOnDay(day: string, event: DragEvent) {
    event.preventDefault();
    const taskId = event.dataTransfer.getData('text/plain');
    setDragging(false);
    setDropDay(null);
    if (taskId) void assignDueDate(taskId, day);
  }

  const showRail = undated.length > 0;
  const weeks = weekSpan(thisWeek, pastCount, futureCount);
  const overdue = tasks.filter(
    (task): task is Task & { dueDate: string } => !!task.dueDate && task.dueDate < today && task.status !== 'done',
  );
  const overdueDate = overdue.map((task) => task.dueDate).sort()[0];

  return (
    <div className={`page calendar-page${dragging ? ' is-assigning' : ''}`}>
      <section className="page-head">
        <span className="page-emoji" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <div className="page-title">
          <h1>
            Calendar
            <span className="calendar-period">{headMonth}</span>
          </h1>
        </div>
        <div className="calendar-head-tools">
          <div className="calendar-nav" role="group" aria-label="Calendar navigation">
            <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => stepMonth(-1)}>
              <Icon name="chevron" />
            </button>
            <button type="button" className="btn sm" onClick={() => focusDate(today)}>
              Today
            </button>
            <button type="button" className="icon-btn" aria-label="Next month" onClick={() => stepMonth(1)}>
              <Icon name="chevron" />
            </button>
          </div>
          <DeadlineCard deadline={deadline} today={today} disabled={savingDeadline} onChange={(dueDate) => void saveDeadline(dueDate)} />
        </div>
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
        <div className="calendar-main" ref={scrollerRef} onScroll={onCalendarScroll}>
          <WeekAgenda
            weeks={weeks}
            today={today}
            deadline={deadline}
            byDay={byDay}
            members={members}
            dropDay={dropDay}
            onOpen={(task) => setDialog({ task })}
            onAdd={(dueDate) => setDialog({ preset: { dueDate } })}
            onDragStart={() => setDragging(true)}
            onDragEnd={() => {
              setDragging(false);
              setDropDay(null);
            }}
            onDragOverDay={dragOverDay}
            onDragLeaveDay={dragLeaveDay}
            onDropDay={dropOnDay}
          />
        </div>

        {showRail && (
          <CalendarRail
            undated={undated}
            members={members}
            onOpen={(task) => setDialog({ task })}
            onDragStart={() => setDragging(true)}
            onDragEnd={() => {
              setDragging(false);
              setDropDay(null);
            }}
          />
        )}
      </div>

      <TaskDialog state={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function CalendarRail({
  undated,
  members,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  undated: Task[];
  members: Map<string, Member>;
  onOpen: (task: Task) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <aside className="calendar-rail" aria-label="Tasks with no due date">
      <section className="calendar-rail-section">
        <header className="calendar-rail-head">
          <h2>No due date</h2>
          <span className="calendar-rail-count">{undated.length}</span>
        </header>
        <p className="rail-hint">Drag onto a day to schedule</p>
        <ul className="undated-list">
          {undated.map((task) => (
            <li key={task.id}>
              <DraggableTask taskId={task.id} onOpen={() => onOpen(task)} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                <span className={`prio prio-${task.priority}`} aria-hidden="true" />
                <span className="num">#{task.num}</span>
                <span className="undated-title">{task.title}</span>
                <Avatar member={task.assigneeId ? members.get(task.assigneeId) : undefined} />
              </DraggableTask>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function DraggableTask({
  taskId,
  className,
  onOpen,
  onDragStart,
  onDragEnd,
  children,
}: {
  taskId: string;
  className?: string;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  children: ReactNode;
}) {
  const dragged = useRef(false);
  const [dragging, setDragging] = useState(false);
  return (
    <button
      type="button"
      draggable
      className={[className, dragging ? 'dragging' : ''].filter(Boolean).join(' ')}
      onDragStart={(event) => {
        dragged.current = true;
        setDragging(true);
        event.dataTransfer.setData('text/plain', taskId);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={() => {
        setDragging(false);
        onDragEnd();
        window.setTimeout(() => {
          dragged.current = false;
        }, 0);
      }}
      onClick={() => {
        if (dragged.current) return;
        onOpen();
      }}
    >
      {children}
    </button>
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
  weeks,
  today,
  deadline,
  byDay,
  members,
  dropDay,
  onOpen,
  onAdd,
  onDragStart,
  onDragEnd,
  onDragOverDay,
  onDragLeaveDay,
  onDropDay,
}: {
  weeks: string[];
  today: string;
  deadline: string | null;
  byDay: Map<string, Task[]>;
  members: Map<string, Member>;
  dropDay: string | null;
  onOpen: (task: Task) => void;
  onAdd: (day: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverDay: (day: string, event: DragEvent) => void;
  onDragLeaveDay: (day: string, event: DragEvent<HTMLElement>) => void;
  onDropDay: (day: string, event: DragEvent) => void;
}) {
  const weekProps = {
    today,
    deadline,
    byDay,
    members,
    dropDay,
    onOpen,
    onAdd,
    onDragStart,
    onDragEnd,
    onDragOverDay,
    onDragLeaveDay,
    onDropDay,
  };
  return (
    <div className="agenda">
      <div className="agenda-dow" aria-hidden="true">
        {WEEKDAYS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {weeks.map((start) => (
        <div key={start} className="agenda-week-block">
          <WeekSection start={start} {...weekProps} />
        </div>
      ))}
    </div>
  );
}

function WeekSection({
  start,
  today,
  deadline,
  byDay,
  members,
  dropDay,
  onOpen,
  onAdd,
  onDragStart,
  onDragEnd,
  onDragOverDay,
  onDragLeaveDay,
  onDropDay,
}: {
  start: string;
  today: string;
  deadline: string | null;
  byDay: Map<string, Task[]>;
  members: Map<string, Member>;
  dropDay: string | null;
  onOpen: (task: Task) => void;
  onAdd: (day: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverDay: (day: string, event: DragEvent) => void;
  onDragLeaveDay: (day: string, event: DragEvent<HTMLElement>) => void;
  onDropDay: (day: string, event: DragEvent) => void;
}) {
  return (
    <section className="agenda-week" id={`week-${start}`} aria-label={weekRelation(start, today)}>
      <div className="agenda-days">
        {weekDays(start).map((day) => (
          <AgendaDay
            key={day}
            day={day}
            today={today}
            deadline={deadline}
            tasks={byDay.get(day) ?? []}
            members={members}
            dropTarget={dropDay === day}
            onOpen={onOpen}
            onAdd={onAdd}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOverDay}
            onDragLeave={onDragLeaveDay}
            onDrop={onDropDay}
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
  dropTarget,
  onOpen,
  onAdd,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  day: string;
  tasks: Task[];
  today: string;
  deadline: string | null;
  members: Map<string, Member>;
  dropTarget: boolean;
  onOpen: (task: Task) => void;
  onAdd: (day: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (day: string, event: DragEvent) => void;
  onDragLeave: (day: string, event: DragEvent<HTMLElement>) => void;
  onDrop: (day: string, event: DragEvent) => void;
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
        dropTarget ? 'drop-target' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={formatLong(day)}
      aria-current={isToday ? 'date' : undefined}
      onDragOver={(event) => onDragOver(day, event)}
      onDragLeave={(event) => onDragLeave(day, event)}
      onDrop={(event) => onDrop(day, event)}
    >
      <header className="agenda-day-head">
        <div className="agenda-date">
          <span className="dow">{weekdayShort(day)}</span>
          <span className="dom-row">
            {dayNumber(day) === 1 && <span className="month">{parseIsoDate(day).toLocaleDateString('en-US', { month: 'short' })}</span>}
            <span className={`dom${isToday ? ' is-today' : ''}`}>{dayNumber(day)}</span>
          </span>
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
            <DraggableTask
              key={task.id}
              taskId={task.id}
              className={`agenda-task${overdue ? ' overdue' : ''}${task.status === 'done' ? ' done' : ''}`}
              onOpen={() => onOpen(task)}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <span className={`prio prio-${task.priority}`} aria-hidden="true" />
              <span className="agenda-task-title">{task.title}</span>
              <span className="agenda-task-meta">
                <span>#{task.num}</span>
                <span>{STATUS_LABEL[task.status]}</span>
                <Avatar member={task.assigneeId ? members.get(task.assigneeId) : undefined} />
              </span>
            </DraggableTask>
          );
        })}
      </div>
    </section>
  );
}
