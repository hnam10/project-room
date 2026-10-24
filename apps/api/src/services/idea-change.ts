import type { Idea, IdeaUpdateInput } from '@project-room/shared';

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
const words = (value: string) => new Set(normalize(value).split(' ').filter(Boolean));

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + Number(a[i - 1] !== b[j - 1]));
      previous = above;
    }
  }
  return row[b.length]!;
}

/** A conservative cheap filter for obvious scope changes. A member can request re-evaluation for ambiguous edits. */
export function isSignificantIdeaChange(before: Idea, patch: IdeaUpdateInput): boolean {
  for (const field of ['title', 'description'] as const) {
    if (patch[field] === undefined) continue;
    const oldText = normalize(before[field]);
    const newText = normalize(patch[field]);
    if (oldText === newText) continue;
    const longest = Math.max(oldText.length, newText.length);
    if (editDistance(oldText, newText) <= Math.max(2, Math.floor(longest * 0.08))) continue;
    if (!oldText || !newText) return longest >= 20;
    const oldWords = words(oldText);
    const newWords = words(newText);
    const shared = [...oldWords].filter((word) => newWords.has(word)).length;
    const overlap = shared / Math.max(oldWords.size, newWords.size);
    if (overlap < 0.5 && editDistance(oldText, newText) / longest > 0.2) return true;
    if (field === 'description' && Math.abs(oldText.length - newText.length) > 100) return true;
  }
  return false;
}
