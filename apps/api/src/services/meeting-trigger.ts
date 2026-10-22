// When to call the live meeting AI. Pure so the thresholds are easy to test.

export interface TriggerState {
  newWords: number;
  lastRunAt: number | null;
  lastLineAt: number | null;
  calls: number;
  inFlight: boolean;
  aiEnabled: boolean;
  live: boolean;
}

export const MAX_CALLS = 60;
const BUSY_WORDS = 80;
const BUSY_GAP_MS = 45_000;
const QUIET_WORDS = 30;
const QUIET_MS = 20_000;

export function shouldRun(state: TriggerState, now: number): boolean {
  if (!state.live || !state.aiEnabled || state.inFlight || state.calls >= MAX_CALLS || state.newWords <= 0) return false;
  const sinceRun = state.lastRunAt === null ? Infinity : now - state.lastRunAt;
  if (state.newWords >= BUSY_WORDS && sinceRun >= BUSY_GAP_MS) return true;
  return state.newWords >= QUIET_WORDS && state.lastLineAt !== null && now - state.lastLineAt >= QUIET_MS;
}
