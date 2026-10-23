import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, connectDb } from '../db/client.js';
import { seedDemoData } from '../db/seed.js';
import { createSuggestion, updateSuggestionDrafts } from './suggestions.js';

beforeAll(async () => {
  await connectDb('mem://');
  await seedDemoData();
});

afterAll(closeDb);

describe('meeting suggestion fields', () => {
  it('stores and returns meeting suggestion fields', async () => {
    const s = await createSuggestion('hackathon', {
      kind: 'poll',
      title: 'Poll: login method',
      reason: 'Jamie and Alex disagree',
      pollDraft: { question: 'Which login?', options: ['Google', 'Email'] },
    });
    expect(s.kind).toBe('poll');
    expect(s.pollDraft).toEqual({ question: 'Which login?', options: ['Google', 'Email'] });
    expect(s.meetingId).toBeNull();
    expect(s.ideaDraft).toBeNull();
  });

  it('rejects an unknown kind', async () => {
    await expect(createSuggestion('hackathon', { kind: 'nope' as never, title: 't', reason: 'r' })).rejects.toThrow();
  });

  it('updates drafts', async () => {
    const s = await createSuggestion('hackathon', {
      kind: 'idea',
      title: 'Idea',
      reason: 'r',
      ideaDraft: { title: 'A', description: 'd', theme: 'Product' },
    });
    const u = await updateSuggestionDrafts(s.id, { ideaDraft: { title: 'B', description: 'e', theme: 'Platform' } });
    expect(u.ideaDraft).toEqual({ title: 'B', description: 'e', theme: 'Platform' });
  });
});
