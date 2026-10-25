import { describe, expect, it } from 'vitest';
import { extractActionItemsByRules, mockProvider } from './mock.js';

const msg = (authorId: string, text: string) => ({ id: text, authorId, authorName: authorId, text });

describe('mock AI rules', () => {
  it('uses earlier chat as the topic when the AI request only says to brainstorm this', async () => {
    const messages = [msg('alex', 'We need to choose a dinner cuisine for our team.'), msg('alex', '@AI brainstorm this')];
    expect(await mockProvider.classifyBrainstorm({ problem: null, ideas: [], request: messages[0]!.text })).toBe('non_product');
    const result = await mockProvider.brainstorm({ messages, existingIdeas: [], research: [], mode: 'non_product' });
    expect(result.topic?.title).toBe('We need to choose a dinner cuisine for our team.');
    expect(result.ideas[0]?.draft).toMatchObject({ title: 'Italian food', theme: 'Option' });
  });
  it('turns commitments into tasks owned by the speaker', () => {
    const items = extractActionItemsByRules([msg('jamie', "I'll work on the password reset flow.")], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'Work on password reset flow', assigneeId: 'jamie', priority: 'medium', include: true });
    // Every item says why it exists and quotes the sentence it came from.
    expect(items[0]?.reason).toContain('jamie');
    expect(items[0]?.quote).toBe("I'll work on the password reset flow.");
  });

  it('finds several items in one message and marks deadline talk as high priority', () => {
    const items = extractActionItemsByRules([msg('alex', "I'll build the demo page. We still need to record the video by Friday.")], []);
    expect(items.map((i) => [i.title, i.assigneeId, i.priority])).toEqual([
      ['Build demo page', 'alex', 'medium'],
      ['Record the video by Friday', null, 'high'],
    ]);
  });

  it('skips tasks that already exist', () => {
    expect(extractActionItemsByRules([msg('alex', 'We need to write tests.')], ['Write tests'])).toEqual([]);
  });
});
