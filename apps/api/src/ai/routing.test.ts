import { describe, expect, it, vi } from 'vitest';
import type { OpenAiClient } from './openai.js';
import type { ProjectLookup } from './provider.js';
import { composeMeetingAi } from './meeting.js';
import { composeAiProvider, type RoutedModel } from './routing.js';

function client(): OpenAiClient {
  return {
    parse: vi.fn(async () => ({ output: {}, usage: { inputTokens: 0, outputTokens: 0 } })),
    chat: vi.fn(async () => ({ content: null, toolCalls: [{ id: 'c1', name: 'finish', arguments: '{}' }] })),
  };
}

function host(api: OpenAiClient): RoutedModel {
  return { label: 'host', client: api, model: 'model', fastModel: 'model' };
}

const lookup = {} as ProjectLookup;

describe('AI host routing', () => {
  it('sends short checks to the frequent host and longer calls to the heavy host', async () => {
    const heavy = client();
    const frequent = client();
    vi.mocked(frequent.parse).mockResolvedValue({ output: { mode: 'product' }, usage: { inputTokens: 1, outputTokens: 1 } });
    vi.mocked(heavy.parse).mockResolvedValue({
      output: { actionItems: [], risks: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const ai = composeAiProvider(host(heavy), host(frequent));

    await ai.classifyBrainstorm({ problem: null, ideas: [], request: 'Build a study planner' });
    expect(frequent.parse).toHaveBeenCalledOnce();
    expect(heavy.parse).not.toHaveBeenCalled();

    await ai.analyzeConversation({
      messages: [{ id: 'm', authorId: 'a', authorName: 'A', text: 'I will write the README' }],
      tasks: [],
      members: [],
    });
    expect(heavy.parse).toHaveBeenCalledOnce();

    await ai.runMention?.({ messages: [{ id: 'm', authorId: 'a', authorName: 'A', text: '@AI what is left?' }], lookup });
    expect(heavy.chat).toHaveBeenCalled();
    expect(frequent.chat).not.toHaveBeenCalled();
    vi.mocked(frequent.parse).mockResolvedValue({
      output: {
        action: 'none',
        explicitRequest: false,
        requestQuote: null,
        title: null,
        titleSourceMessageId: null,
        topicId: null,
        topicReference: null,
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    await ai.interpretChatIntent({
      message: { id: 'm2', authorId: 'a', authorName: 'A', text: 'What if we built a fitness app?' },
      recentMessages: [],
      topics: [],
    });
    expect(frequent.parse).toHaveBeenCalledTimes(2);
    expect(heavy.parse).toHaveBeenCalledOnce();
  });

  it('sends live meeting ticks to the frequent host and the end summary to the heavy host', async () => {
    const heavy = client();
    const frequent = client();
    vi.mocked(frequent.parse).mockResolvedValue({
      output: { topic: null, actionItems: [], ideas: [], polls: [], runningSummary: 'Talked.' },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    vi.mocked(heavy.parse).mockResolvedValue({
      output: {
        topic: null,
        summary: { overview: 'Done.', decisions: [], openQuestions: [], nextSteps: [] },
        actionItems: [],
        carryOverItems: [],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const meeting = composeMeetingAi(host(heavy), host(frequent));
    const shared = { lines: [], carryOver: [], ideas: [], taskTitles: [], members: [] };

    await meeting.meetingTick({ ...shared, runningSummary: '', alreadySuggested: [] });
    await meeting.summarizeMeeting({ ...shared, suggestions: [] });

    expect(heavy.parse).toHaveBeenCalledOnce();
    expect(frequent.parse).toHaveBeenCalledOnce();
  });
});
