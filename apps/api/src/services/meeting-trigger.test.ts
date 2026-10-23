import { describe, expect, it } from 'vitest';
import { shouldRun, type TriggerState } from './meeting-trigger.js';

const base: TriggerState = { newWords: 0, lastRunAt: null, lastLineAt: 99_999, calls: 0, inFlight: false, aiEnabled: true, live: true };

describe('shouldRun', () => {
  it.each([
    ['40 words, 20s since last run', { newWords: 40, lastRunAt: 0 }, 20_000, true],
    ['40 words, 10s since last run', { newWords: 40, lastRunAt: 0 }, 10_000, false],
    ['40 words, never run', { newWords: 40 }, 1_000, true],
    ['15 words then 8s silence', { newWords: 15, lastLineAt: 0, lastRunAt: null }, 8_000, true],
    ['15 words, only 5s silence', { newWords: 15, lastLineAt: 0 }, 5_000, false],
    ['14 words then silence', { newWords: 14, lastLineAt: 0 }, 60_000, false],
    ['call cap reached', { newWords: 500, calls: 150 }, 99_999, false],
    ['AI removed', { newWords: 500, aiEnabled: false }, 99_999, false],
    ['call in flight', { newWords: 500, inFlight: true }, 99_999, false],
    ['meeting ended', { newWords: 500, live: false }, 99_999, false],
    ['no new words', { newWords: 0, lastLineAt: 0 }, 99_999, false],
  ] as [string, Partial<TriggerState>, number, boolean][])('%s', (_name, partial, now, expected) => {
    expect(shouldRun({ ...base, ...partial }, now)).toBe(expected);
  });
});
