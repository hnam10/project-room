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

// Tuned so the AI reacts within ~10s of a pause, like a participant; the cap still bounds a 60-minute meeting.
export const MAX_CALLS = 150;
const BUSY_WORDS = 40;
const BUSY_GAP_MS = 20_000;
const QUIET_WORDS = 15;
const QUIET_MS = 8_000;

export function shouldRun(state: TriggerState, now: number): boolean {
  if (!state.live || !state.aiEnabled || state.inFlight || state.calls >= MAX_CALLS || state.newWords <= 0) return false;
  const sinceRun = state.lastRunAt === null ? Infinity : now - state.lastRunAt;
  if (state.newWords >= BUSY_WORDS && sinceRun >= BUSY_GAP_MS) return true;
  return state.newWords >= QUIET_WORDS && state.lastLineAt !== null && now - state.lastLineAt >= QUIET_MS;
}
