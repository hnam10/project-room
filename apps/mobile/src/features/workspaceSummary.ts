import type { Poll, Task, TaskStatus, WorkspaceSnapshot } from '@project-room/shared';
import { pendingAssistantSuggestions } from './assistantSuggestions';

export function pendingSuggestionCount(snapshot: WorkspaceSnapshot): number {
  return pendingAssistantSuggestions(snapshot.suggestions, snapshot.ideas).length;
}

export function openPolls(snapshot: WorkspaceSnapshot): Poll[] {
  return snapshot.polls.filter((poll) => poll.status === 'open');
}

export function sortedPolls(snapshot: WorkspaceSnapshot): Poll[] {
  return [...snapshot.polls].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export interface TaskStatusCounts {
  todo: number;
  progress: number;
  review: number;
  done: number;
}

export function myTaskStatusCounts(tasks: Task[], memberId: string | null | undefined): TaskStatusCounts {
  const counts: TaskStatusCounts = { todo: 0, progress: 0, review: 0, done: 0 };
  if (!memberId) return counts;
  for (const task of tasks) {
    if (task.assigneeId !== memberId) continue;
    counts[task.status] += 1;
  }
  return counts;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export type DueUrgency = 'overdue' | 'today' | 'soon';

export function taskDueUrgency(task: Task, now = new Date()): DueUrgency | null {
  if (!task.dueDate || task.status === 'done') return null;
  const due = startOfLocalDay(new Date(task.dueDate));
  const today = startOfLocalDay(now);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 7) return 'soon';
  return null;
}

export function myTasksDueSoon(tasks: Task[], memberId: string | null | undefined, now = new Date()): Task[] {
  if (!memberId) return [];
  const order: Record<DueUrgency, number> = { overdue: 0, today: 1, soon: 2 };
  return tasks
    .filter((task) => task.assigneeId === memberId)
    .map((task) => ({ task, urgency: taskDueUrgency(task, now) }))
    .filter((row): row is { task: Task; urgency: DueUrgency } => row.urgency !== null)
    .sort((a, b) => order[a.urgency] - order[b.urgency] || a.task.dueDate!.localeCompare(b.task.dueDate!))
    .map((row) => row.task);
}

export function formatDueDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function statusSummaryLine(counts: TaskStatusCounts): string {
  const parts: string[] = [];
  if (counts.progress) parts.push(`${counts.progress} in progress`);
  if (counts.review) parts.push(`${counts.review} in review`);
  if (counts.todo) parts.push(`${counts.todo} to do`);
  if (!parts.length && counts.done) return `${counts.done} done`;
  if (!parts.length) return 'No active tasks';
  return parts.join(' · ');
}
