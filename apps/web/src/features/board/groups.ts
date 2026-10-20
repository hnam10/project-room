import type { Member, Task } from '@project-room/shared';

export type GroupBy = 'status' | 'priority' | 'assigneeId';

export interface Column {
  id: string;
  label: string;
  color: string;
}

export const STATUS_COLUMNS: Column[] = [
  { id: 'todo', label: 'To Do', color: '#9aa1b0' },
  { id: 'progress', label: 'In Progress', color: '#2f80ed' },
  { id: 'review', label: 'Review', color: '#e0a100' },
  { id: 'done', label: 'Done', color: '#16a36a' },
];

export const PRIORITY_COLUMNS: Column[] = [
  { id: 'high', label: 'High', color: '#dc4b4b' },
  { id: 'medium', label: 'Medium', color: '#e0a100' },
  { id: 'low', label: 'Low', color: '#9aa1b0' },
];

const UNASSIGNED = '';

export function columnsFor(groupBy: GroupBy, members: Member[]): Column[] {
  if (groupBy === 'status') return STATUS_COLUMNS;
  if (groupBy === 'priority') return PRIORITY_COLUMNS;
  return [...members.map((m) => ({ id: m.id, label: m.name, color: m.color })), { id: UNASSIGNED, label: 'Unassigned', color: '#c4c8d2' }];
}

/** The column a task belongs to under the given grouping. */
export function columnOf(task: Task, groupBy: GroupBy): string {
  return groupBy === 'assigneeId' ? (task.assigneeId ?? UNASSIGNED) : task[groupBy];
}

/** The task change that moves it into a column. */
export function patchForColumn(groupBy: GroupBy, columnId: string): Partial<Task> {
  if (groupBy === 'assigneeId') return { assigneeId: columnId || null };
  return { [groupBy]: columnId } as Partial<Task>;
}
