// Calendar dates are stored as YYYY-MM-DD with no time. Weeks start on Monday.
// Comparisons use the local calendar day, so "today" matches the clock on the machine.

export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function todayIso(now = new Date()): string {
  return isoDate(now);
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/** Monday of the week that contains `iso`. */
export function startOfWeek(iso: string): string {
  const date = parseIsoDate(iso);
  const weekday = date.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + offset);
  return isoDate(date);
}

export function weekDays(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(startIso, index));
}

/** Whole local days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso).getTime();
  const to = parseIsoDate(toIso).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function weekdayShort(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', { weekday: 'short' });
}

export function dayNumber(iso: string): number {
  return parseIsoDate(iso).getDate();
}

export function formatShort(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatLong(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function weekRangeLabel(startIso: string): string {
  const end = parseIsoDate(addDays(startIso, 6));
  const start = parseIsoDate(startIso);
  if (start.getFullYear() !== end.getFullYear()) {
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
  }
  const sameMonth = start.getMonth() === end.getMonth();
  const startText = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endText = end.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' });
  return `${startText} – ${endText}, ${end.getFullYear()}`;
}

export function relativeDay(iso: string, today: string): string {
  const days = daysBetween(today, iso);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 1) return `in ${days} days`;
  return `${-days} days ago`;
}

export function weekRelation(startIso: string, today: string): string {
  const weeks = Math.round(daysBetween(startOfWeek(today), startIso) / 7);
  if (weeks === 0) return 'This week';
  if (weeks === 1) return 'Next week';
  if (weeks === -1) return 'Last week';
  if (weeks > 1) return `In ${weeks} weeks`;
  return `${-weeks} weeks ago`;
}
