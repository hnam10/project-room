import { describe, expect, it } from 'vitest';
import type { Decision } from '@project-room/shared';
import { answerFromDecisionsByRules, detectOpenQuestionByRules, extractActionItemsByRules, mockProvider } from './mock.js';

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

  it('spots open questions', () => {
    expect(detectOpenQuestionByRules("We still haven't decided which database to use.")).toEqual({ topic: 'which database to use' });
    expect(detectOpenQuestionByRules('Should we ship dark mode first?')).toEqual({ topic: 'ship dark mode first' });
    expect(detectOpenQuestionByRules('Nice work everyone')).toBeNull();
  });

  it('answers memory questions from approved decisions only, and says when none match', () => {
    const decision = (id: string, title: string, outcome: string, reason: string): Decision => ({
      id,
      projectId: 'p',
      title,
      status: 'decided',
      raisedById: 'alex',
      decidedById: 'alex',
      outcome,
      reason,
      quote: null,
      createdAt: '2026-10-01T00:00:00Z',
      decidedAt: '2026-10-01T00:00:00Z',
    });
    const decisions = [
      decision('d1', 'Which frontend framework to use', 'React + Vite, not Next.js', 'No SEO needed'),
      decision('d2', 'Where to host the demo', 'Fly.io', 'Needs a persistent disk'),
    ];
    expect(answerFromDecisionsByRules('why did we choose Vite for the frontend?', decisions).sourceDecisionIds).toEqual(['d1']);
    expect(answerFromDecisionsByRules('which database did we pick?', decisions).sourceDecisionIds).toEqual([]);
  });
});
