import { describe, expect, it } from 'vitest';
import { asksToBrainstorm } from './ai-engine.js';

describe('asksToBrainstorm', () => {
  it('treats an explicit brainstorm request as brainstorming', () => {
    expect(asksToBrainstorm('@AI brainstorm ways to reduce food waste on campus')).toBe(true);
    expect(asksToBrainstorm('@AI brainstorm this')).toBe(true);
    expect(asksToBrainstorm('@AI please ideate on the poster')).toBe(true);
    expect(asksToBrainstorm('@AI ideas for dinner')).toBe(true);
    expect(asksToBrainstorm('@AI can you suggest some ideas about snacks')).toBe(true);
    expect(asksToBrainstorm('@AI could you brainstorm this?')).toBe(true);
    expect(asksToBrainstorm('@AI, please brainstorm this')).toBe(true);
    expect(asksToBrainstorm('@AI can you help me brainstorm dinner?')).toBe(true);
    expect(asksToBrainstorm('@AI we want to brainstorm the poster')).toBe(true);
    expect(asksToBrainstorm('@AI any ideas for the poster?')).toBe(true);
  });

  it('lets a normal question that mentions an idea be answered', () => {
    expect(asksToBrainstorm('@AI what was Jamie’s idea?')).toBe(false);
    expect(asksToBrainstorm('@AI I like the idea of using React')).toBe(false);
    expect(asksToBrainstorm('@AI any tasks?')).toBe(false);
    expect(asksToBrainstorm('@AI where do we host the demo?')).toBe(false);
    expect(asksToBrainstorm('@AI did Morgan say she has ideas for the poster?')).toBe(false);
    expect(asksToBrainstorm('@AI what did we brainstorm yesterday?')).toBe(false);
    expect(asksToBrainstorm('@AI can you explain Jamie’s idea?')).toBe(false);
  });
});
