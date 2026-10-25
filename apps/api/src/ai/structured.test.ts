import { describe, expect, it, vi } from 'vitest';
import { createStructuredProvider } from './structured.js';

// The model is replaced by a fake: these tests check what we do with its output, not the model.

function providerReturning(output: unknown, error?: string) {
  const parse = error
    ? vi.fn().mockRejectedValue(new Error(error))
    : vi.fn().mockResolvedValue({ output, usage: { inputTokens: 0, outputTokens: 0 } });
  const provider = createStructuredProvider({ parse }, 'test-model');
  return { provider, parse };
}

const messages = [
  { id: 'm1', authorId: 'jamie', authorName: 'Jamie', text: "I'll work on the password reset flow." },
  { id: 'm2', authorId: 'morgan', authorName: 'Morgan', text: 'Landing page UI still has no owner and it is due Friday.' },
];
const members = [
  { id: 'jamie', name: 'Jamie', role: 'Backend' },
  { id: 'morgan', name: 'Morgan', role: 'DevOps' },
];
const tasks = [
  { id: 't18', num: 18, title: 'Landing page UI', status: 'todo', priority: 'medium' as const, assigneeId: null, dueDate: null },
];

describe('structured provider', () => {
  it('summarizes supplied research and drops invented source URLs', async () => {
    const { provider, parse } = providerReturning({
      summaries: [
        { url: 'https://example.com/planner', summary: 'A calendar that helps student groups coordinate due dates.' },
        { url: 'https://unknown.example', summary: 'Unknown claim' },
      ],
    });
    const summaries = await provider.summarizeResearch({
      idea: { title: 'Group assignment calendar', description: 'Help students track deadlines.' },
      results: [
        { title: 'Student planner', url: 'https://example.com/planner', content: 'Groups share assignment deadlines in a calendar.' },
      ],
    });
    expect(summaries).toEqual([
      { url: 'https://example.com/planner', summary: 'A calendar that helps student groups coordinate due dates.' },
    ]);
    expect(parse.mock.calls[0]![0].content).toContain('<results>');
  });

  it('keeps real quotes and drops invented ones, unknown owners, duplicates and unknown tasks', async () => {
    const { provider, parse } = providerReturning({
      actionItems: [
        {
          title: 'Implement password reset',
          assigneeId: 'jamie',
          priority: 'high',
          reason: 'Jamie volunteered',
          quote: "I'll work on the password reset flow.",
        },
        {
          title: 'Book a venue',
          assigneeId: 'nobody',
          priority: 'URGENT!!',
          reason: 'Seems needed',
          quote: 'We must book a venue immediately',
        },
        { title: 'Landing page UI', assigneeId: null, priority: 'low', reason: 'duplicate of an existing task', quote: null },
      ],
      risks: [
        {
          taskId: 't18',
          title: 'Landing page has no owner',
          reason: 'Due Friday',
          quote: 'Landing page UI still has no owner and it is due Friday.',
        },
        { taskId: 't999', title: 'Ghost task', reason: 'made up', quote: null },
      ],
    });
    const out = await provider.analyzeConversation({ messages, tasks, members });

    expect(out.actionItems.map((i) => [i.title, i.assigneeId, i.priority, i.quote !== null])).toEqual([
      ['Implement password reset', 'jamie', 'high', true],
      // Unknown owner -> unassigned, unrecognised priority -> medium, invented quote -> none.
      ['Book a venue', null, 'medium', false],
    ]);
    expect(out.risks.map((r) => r.taskId)).toEqual(['t18']);

    // Structured output is requested, and the chat text is passed as data inside tags.
    const request = parse.mock.calls[0]![0];
    expect(request.model).toBe('test-model');
    expect(request.schema).toBeDefined();
    expect(request.content).toContain('<conversation>');
  });

  it('keeps brainstorm citations only when they came from the supplied research', async () => {
    const { provider } = providerReturning({
      topic: {
        title: 'Reduce campus food waste',
        description: 'Help students redirect surplus food.',
        reason: 'The team discussed food waste.',
        quote: 'Landing page UI still has no owner',
      },
      ideas: [
        {
          title: 'Campus surplus exchange',
          description: 'Match dining halls with student groups before food is discarded.',
          theme: 'Engagement',
          reason: 'It gives the team a concrete, testable intervention.',
          quote: 'Landing page UI still has no owner',
          sourceUrls: ['https://example.com/research', 'https://invented.example/source'],
        },
      ],
    });
    const result = await provider.brainstorm({
      messages,
      existingIdeas: [],
      research: [{ title: 'Food waste study', url: 'https://example.com/research', content: 'Campus dining waste can be redirected.' }],
    });

    expect(result.topic).toMatchObject({ title: 'Reduce campus food waste', quote: 'Landing page UI still has no owner' });
    expect(result.ideas[0]?.draft.theme).toBe('Product');
    expect(result.ideas[0]?.quote).toBe('Landing page UI still has no owner');
    expect(result.ideas[0]?.sourceUrls).toEqual(['https://example.com/research']);
  });

  it('classifies the goal before research and distinguishes direct options from strategies', async () => {
    const classified = providerReturning({ mode: 'non_product' });
    expect(
      await classified.provider.classifyBrainstorm({
        problem: { title: 'Promote student film night', description: 'Plan an event that brings more students together.' },
        ideas: [],
      }),
    ).toBe('non_product');
    expect(classified.parse.mock.calls[0]![0].content).toContain('Do not guess that every brainstorm is a product');

    const drafted = providerReturning({
      ideas: [
        {
          title: 'Invite student hosts',
          description: 'Let clubs host short introductions before each film.',
          theme: 'Strategy',
          reason: 'Clubs can bring their members.',
          quote: null,
          sourceUrls: [],
        },
      ],
    });
    const ideas = await drafted.provider.brainstorm({ messages, existingIdeas: [], research: [], mode: 'non_product' });
    expect(ideas.ideas[0]?.draft.theme).toBe('Strategy');
    expect(drafted.parse.mock.calls[0]![0].content).toContain('not to build a product');

    const meal = providerReturning({
      ideas: [
        {
          title: 'Italian food',
          description: 'Try pasta or pizza for dinner.',
          theme: 'Option',
          reason: 'The team asked what to eat.',
          quote: null,
          sourceUrls: [],
        },
      ],
    });
    const options = await meal.provider.brainstorm({ messages, existingIdeas: [], research: [], mode: 'non_product' });
    expect(options.ideas[0]?.draft.theme).toBe('Option');
    expect(meal.parse.mock.calls[0]![0].content).toContain('cuisine');
  });

  it('fails loudly when the model refuses', async () => {
    const { provider } = providerReturning(null, 'The model declined this request');
    await expect(provider.analyzeConversation({ messages, tasks, members })).rejects.toThrow(/declined/);
  });
});
