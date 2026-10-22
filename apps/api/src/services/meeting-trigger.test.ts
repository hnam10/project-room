import { describe, expect, it } from 'vitest';
import { shouldRun, type TriggerState } from './meeting-trigger.js';

const base: TriggerState = { newWords: 0, lastRunAt: null, lastLineAt: 99_999, calls: 0, inFlight: false, aiEnabled: true, live: true };

describe('shouldRun', () => {
  it.each([
    ['80 words, 45s since last run', { newWords: 80, lastRunAt: 0 }, 45_000, true],
    ['80 words, 30s since last run', { newWords: 80, lastRunAt: 0 }, 30_000, false],
    ['80 words, never run', { newWords: 80 }, 1_000, true],
    ['30 words then 20s silence', { newWords: 30, lastLineAt: 0, lastRunAt: null }, 20_000, true],
    ['30 words, only 10s silence', { newWords: 30, lastLineAt: 0 }, 10_000, false],
    ['29 words then silence', { newWords: 29, lastLineAt: 0 }, 60_000, false],
    ['call cap reached', { newWords: 500, calls: 60 }, 99_999, false],
    ['AI removed', { newWords: 500, aiEnabled: false }, 99_999, false],
    ['call in flight', { newWords: 500, inFlight: true }, 99_999, false],
    ['meeting ended', { newWords: 500, live: false }, 99_999, false],
    ['no new words', { newWords: 0, lastLineAt: 0 }, 99_999, false],
  ] as [string, Partial<TriggerState>, number, boolean][])('%s', (_name, partial, now, expected) => {
    expect(shouldRun({ ...base, ...partial }, now)).toBe(expected);
  });
});
