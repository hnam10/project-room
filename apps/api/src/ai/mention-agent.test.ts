import { describe, expect, it, vi } from 'vitest';
import { runMentionAgent } from './mention-agent.js';
import type { ChatMessage } from './openai.js';
import type { ProjectLookup } from './provider.js';

function lookup(overrides: Partial<ProjectLookup> = {}): ProjectLookup {
  return {
    listMembers: vi.fn(async () => [{ id: 'morgan', name: 'Morgan', role: 'Design' }]),
    listTasks: vi.fn(async () => [
      { id: 't1', num: 1, title: 'Existing task', status: 'todo', priority: 'medium', assigneeId: null, dueDate: null },
    ]),
    searchMessages: vi.fn(async () => []),
    listPendingSuggestions: vi.fn(async () => []),
    listIdeas: vi.fn(async () => []),
    ...overrides,
  };
}

function chatReturning(turns: { name: string; arguments: string }[][]) {
  const chat = vi.fn();
  for (const calls of turns) {
    chat.mockResolvedValueOnce({
      content: null,
      toolCalls: calls.map((call, index) => ({
        id: `call_${chat.mock.calls.length}_${index}`,
        name: call.name,
        arguments: call.arguments,
      })),
    });
  }
  return chat;
}

const recent = [{ id: 'm1', authorId: 'morgan', authorName: 'Morgan', text: 'Please book a demo room tomorrow' }];

describe('mention agent', () => {
  it('keeps a proposal whose quote and assignee match project data, and drops a risk with an unknown task', async () => {
    const tools = lookup();
    const chat = chatReturning([
      [
        {
          name: 'propose_action_items',
          arguments: JSON.stringify({
            items: [
              { title: 'Book a demo room', assigneeId: 'morgan', priority: 'high', reason: 'Morgan asked', quote: 'book a demo room' },
              { title: 'Existing task', assigneeId: 'morgan', priority: 'low', reason: 'dup', quote: 'book a demo room' },
              { title: 'Invent a mascot', assigneeId: 'ghost', priority: 'nope', reason: 'unclear owner', quote: 'not in the chat' },
            ],
          }),
        },
        { name: 'propose_risk', arguments: JSON.stringify({ taskId: 'missing', title: 'Slip', reason: 'no', quote: '' }) },
        { name: 'finish', arguments: '{}' },
      ],
    ]);

    const out = await runMentionAgent({ chat }, 'openai/gpt-oss-120b', { messages: recent, lookup: tools });

    expect(chat).toHaveBeenCalledTimes(1);
    expect(out.actionItems.map((item) => item.title)).toEqual(['Book a demo room', 'Invent a mascot']);
    expect(out.actionItems[0]).toMatchObject({ assigneeId: 'morgan', priority: 'high', quote: 'book a demo room' });
    expect(out.actionItems[1]).toMatchObject({ assigneeId: null, priority: 'medium', quote: null });
    expect(out.risks).toEqual([]);
  });

  it('keeps a quote that came back from search_messages', async () => {
    const tools = lookup({
      searchMessages: vi.fn(async () => [{ id: 'old', authorName: 'Jamie', text: 'We will host on Fly.io' }]),
    });
    const chat = chatReturning([
      [{ name: 'search_messages', arguments: JSON.stringify({ query: 'Fly.io' }) }],
      [
        {
          name: 'propose_idea',
          arguments: JSON.stringify({
            title: 'Host on Fly.io',
            description: '',
            theme: 'Option',
            reason: 'Jamie said so',
            quote: 'host on Fly.io',
          }),
        },
        { name: 'finish', arguments: '{}' },
      ],
    ]);

    const out = await runMentionAgent({ chat }, 'model', {
      messages: [{ id: 'm1', authorId: 'alex', authorName: 'Alex', text: '@AI where are we hosting?' }],
      lookup: tools,
    });

    expect(tools.searchMessages).toHaveBeenCalledWith('Fly.io');
    expect(out.ideas.map((idea) => idea.quote)).toEqual(['host on Fly.io']);
  });

  it('stops after four rounds when the model keeps calling read tools', async () => {
    const chat = vi.fn(async () => ({ content: null, toolCalls: [{ id: 'c', name: 'list_members', arguments: '{}' }] }));
    const out = await runMentionAgent({ chat }, 'model', { messages: recent, lookup: lookup() });
    expect(chat).toHaveBeenCalledTimes(4);
    expect(out).toEqual({ reply: '', actionItems: [], risks: [], ideas: [] });
  });

  it('nudges once when the model replies with prose, then accepts a later proposal', async () => {
    const chat = vi.fn();
    chat.mockResolvedValueOnce({ content: 'Sure, I can help.', toolCalls: [] });
    chat.mockResolvedValueOnce({
      content: null,
      toolCalls: [
        {
          id: 'idea',
          name: 'propose_idea',
          arguments: JSON.stringify({
            title: 'Offline mode',
            description: 'Works on trains',
            theme: 'nope',
            reason: 'said in chat',
            quote: '',
          }),
        },
        { id: 'done', name: 'finish', arguments: '{}' },
      ],
    });
    const out = await runMentionAgent({ chat }, 'model', { messages: recent, lookup: lookup() });
    expect(chat).toHaveBeenCalledTimes(2);
    const nudge = (chat.mock.calls[1] as unknown as [{ messages: ChatMessage[] }])[0].messages.at(-1);
    expect(nudge).toMatchObject({ role: 'user' });
    expect(out.ideas).toEqual([
      { title: 'Offline mode', description: 'Works on trains', theme: 'Product', reason: 'said in chat', quote: null },
    ]);
  });

  it('answers from the thread and keeps a quote copied from a file passage', async () => {
    const chat = chatReturning([
      [
        { name: 'reply', arguments: JSON.stringify({ text: 'The report is due Friday.' }) },
        {
          name: 'propose_action_items',
          arguments: JSON.stringify({
            items: [{ title: 'Finish the report', assigneeId: '', priority: 'high', reason: 'The rubric says so', quote: 'due Friday' }],
          }),
        },
        { name: 'finish', arguments: '{}' },
      ],
    ]);
    const files = [{ name: 'rubric.pdf', text: 'The report is due Friday.' }];
    const out = await runMentionAgent({ chat }, 'model', {
      messages: [{ id: 'm1', authorId: 'alex', authorName: 'Alex', text: '@AI when is the report due?' }],
      files,
      lookup: lookup(),
    });
    const prompt = (chat.mock.calls[0] as unknown as [{ messages: ChatMessage[] }])[0].messages[1]?.content;
    expect(prompt).toContain('rubric.pdf: The report is due Friday.');
    expect(out.reply).toBe('The report is due Friday.');
    expect(out.actionItems[0]?.quote).toBe('due Friday');
  });
});
