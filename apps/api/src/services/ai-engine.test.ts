import { describe, expect, it } from 'vitest';
import { asksToBrainstorm, leadingOption } from './ai-engine.js';

describe('asksToBrainstorm', () => {
  it('treats an explicit brainstorm request as brainstorming', () => {
    expect(asksToBrainstorm('@AI brainstorm ways to reduce food waste on campus')).toBe(true);
    expect(asksToBrainstorm('@AI brainstorm this')).toBe(true);
    expect(asksToBrainstorm('@AI please ideate on the poster')).toBe(true);
    expect(asksToBrainstorm('@AI ideas for dinner')).toBe(true);
    expect(asksToBrainstorm('@AI can you suggest some ideas about snacks')).toBe(true);
  });

  it('lets a normal question that mentions an idea be answered', () => {
    expect(asksToBrainstorm('@AI what was Jamie’s idea?')).toBe(false);
    expect(asksToBrainstorm('@AI I like the idea of using React')).toBe(false);
    expect(asksToBrainstorm('@AI any tasks?')).toBe(false);
    expect(asksToBrainstorm('@AI where do we host the demo?')).toBe(false);
    expect(asksToBrainstorm('@AI did Morgan say she has ideas for the poster?')).toBe(false);
  });
});

describe('leadingOption', () => {
  it('names the option that is strictly ahead and ignores a tie or an empty poll', () => {
    expect(
      leadingOption([
        { label: 'Fly.io', votes: 3 },
        { label: 'Railway', votes: 1 },
      ]),
    ).toBe('Fly.io');
    expect(
      leadingOption([
        { label: 'Fly.io', votes: 2 },
        { label: 'Railway', votes: 2 },
      ]),
    ).toBeNull();
    expect(
      leadingOption([
        { label: 'Fly.io', votes: 0 },
        { label: 'Railway', votes: 0 },
      ]),
    ).toBeNull();
  });
});
