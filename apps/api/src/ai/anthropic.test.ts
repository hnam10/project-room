import { describe, expect, it, vi } from 'vitest';
import type { Decision } from '@project-room/shared';
import { createAnthropicProvider } from './anthropic.js';

// The model is replaced by a fake: these tests check what we do with its output, not the model.

function providerReturning(parsed: unknown, stop_reason = 'end_turn') {
  const parse = vi.fn().mockResolvedValue({ stop_reason, parsed_output: parsed });
  const provider = createAnthropicProvider('test-key', 'test-model', { messages: { parse } } as never);
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

describe('Anthropic provider', () => {
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
      decisions: [{ topic: 'Which database', outcome: null, reason: 'Unsettled', quote: 'Landing page UI still has no owner' }],
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
    expect(out.decisions[0]?.quote).toBe('Landing page UI still has no owner');
    expect(out.risks.map((r) => r.taskId)).toEqual(['t18']);

    // Structured output is requested, and the chat text is passed as data inside tags.
    const request = parse.mock.calls[0]![0];
    expect(request.model).toBe('test-model');
    expect(request.output_config.format).toBeDefined();
    expect(request.messages[0].content).toContain('<conversation>');
  });

  it('only asks the model about messages that read like open questions', async () => {
    const { provider, parse } = providerReturning({ actionItems: [], decisions: [], risks: [] });
    expect(await provider.detectOpenQuestion({ id: 'm', authorId: 'a', authorName: 'A', text: 'Nice work everyone' })).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    await provider.detectOpenQuestion({ id: 'm', authorId: 'a', authorName: 'A', text: 'Should we use Postgres?' });
    expect(parse).toHaveBeenCalledOnce();
  });

  it('answers from the given decisions and ignores source ids it was not given', async () => {
    const decided = {
      id: 'd1',
      title: 'Where to host',
      outcome: 'Fly.io',
      reason: 'Needs a disk',
      decidedAt: '2026-10-02T00:00:00Z',
      decidedById: 'jamie',
    } as Decision;
    const { provider, parse } = providerReturning({ answer: 'Fly.io, because it needs a disk.', sourceDecisionIds: ['d1', 'd404'] });
    const out = await provider.answerFromDecisions({ question: 'Where do we host?', decisions: [decided], members });
    expect(out.sourceDecisionIds).toEqual(['d1']);
    const prompt: string = parse.mock.calls[0]![0].messages[0].content;
    expect(prompt).toContain('<decision id="d1"');
    expect(prompt).toContain('ONLY the approved decisions');
  });

  it('does not call the model when there are no approved decisions', async () => {
    const { provider, parse } = providerReturning({});
    const out = await provider.answerFromDecisions({ question: 'Anything?', decisions: [], members });
    expect(out.sourceDecisionIds).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });

  it('fails loudly when the model refuses', async () => {
    const { provider } = providerReturning(null, 'refusal');
    await expect(provider.analyzeConversation({ messages, tasks, members })).rejects.toThrow(/declined/);
  });
});
