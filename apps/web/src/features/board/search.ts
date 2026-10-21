import type { Member, Task } from '@project-room/shared';
import { PRIORITY_COLUMNS, STATUS_COLUMNS } from './groups';

const labelOf = (columns: { id: string; label: string }[], id: string) => columns.find((c) => c.id === id)?.label ?? id;

/** Lower-cased keywords from a search query; empty when there's nothing to search for. */
export function keywordsOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Tasks matching every keyword (case-insensitive, partial). A keyword can match the title, number (#12),
 * label, status, priority or assignee name. Tasks whose title contains all keywords come first.
 */
export function searchTasks(tasks: Task[], members: Member[], keywords: string[]): Task[] {
  if (!keywords.length) return [];
  const names = new Map(members.map((m) => [m.id, m.name]));
  const scored: [Task, number][] = [];
  for (const task of tasks) {
    const title = task.title.toLowerCase();
    const fields = [
      title,
      `#${task.num}`,
      task.label,
      labelOf(STATUS_COLUMNS, task.status),
      labelOf(PRIORITY_COLUMNS, task.priority),
      task.assigneeId ? (names.get(task.assigneeId) ?? '') : 'unassigned',
    ].map((f) => f.toLowerCase());
    if (!keywords.every((k) => fields.some((f) => f.includes(k)))) continue;
    scored.push([task, keywords.every((k) => title.includes(k)) ? 0 : 1]);
  }
  return scored.sort(([a, sa], [b, sb]) => sa - sb || a.num - b.num).map(([task]) => task);
}

/** Splits text into plain and matched parts so the matches can be highlighted. */
export function highlightParts(text: string, keywords: string[]): { text: string; match: boolean }[] {
  if (!keywords.length) return [{ text, match: false }];
  const pattern = new RegExp(
    `(${[...keywords]
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})`,
    'gi',
  );
  return text
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({ text: part, match: keywords.includes(part.toLowerCase()) }));
}
