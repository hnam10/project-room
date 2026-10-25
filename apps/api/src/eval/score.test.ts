import { describe, expect, it } from 'vitest';
import { rates, scoreCase, similarity } from './score.js';

describe('eval scoring', () => {
  it('matches reworded titles and ignores filler words', () => {
    expect(similarity('Build the login page', 'Login page build')).toBe(1);
    expect(similarity('Book a demo room', 'Write the README')).toBe(0);
  });

  it('pairs each item once, counts misses, extras and assignees', () => {
    const score = scoreCase(
      [
        { title: 'Build the login page', assignee: 'jamie' },
        { title: 'Book a demo room', assignee: null },
        { title: 'Write the pitch deck', assignee: 'alex' },
      ],
      [
        { title: 'Build login page', assigneeId: 'jamie' },
        { title: 'Login page styling', assigneeId: 'jamie' },
        { title: 'Book demo room', assigneeId: 'alex' },
        { title: 'Order pizza', assigneeId: null },
      ],
    );
    expect(score).toEqual({ expected: 3, proposed: 4, matched: 2, assigneeRight: 1 });
    const r = rates(score);
    expect([r.precision, r.recall, r.f1, r.assignee].map((n) => n.toFixed(3))).toEqual(['0.500', '0.667', '0.571', '0.500']);
  });

  it('finds the most pairs even when the best overlap would block one', () => {
    // Greedy best-first pairs "alpha beta gamma" with itself and leaves "alpha beta" unmatched.
    const score = scoreCase(
      [
        { title: 'alpha beta gamma', assignee: null },
        { title: 'alpha beta', assignee: null },
      ],
      [
        { title: 'alpha beta gamma', assigneeId: null },
        { title: 'gamma', assigneeId: null },
      ],
    );
    expect(score.matched).toBe(2);
  });
});
