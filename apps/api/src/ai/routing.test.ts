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

function host(label: string, model: string, api: OpenAiClient): RoutedModel {
  return { label, client: api, model, fastModel: label === 'openai' ? 'gpt-fast' : model };
}

const lookup = {} as ProjectLookup;

describe('AI host routing', () => {
  it('sends short checks to Nebius and @AI plus conversation analysis to OpenAI', async () => {
    const openai = client();
    const nebius = client();
    vi.mocked(nebius.parse).mockResolvedValue({ output: { mode: 'product' }, usage: { inputTokens: 1, outputTokens: 1 } });
    vi.mocked(openai.parse).mockResolvedValue({
      output: { actionItems: [], risks: [] },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const ai = composeAiProvider(host('openai', 'gpt-4.1-mini', openai), host('nebius', 'openai/gpt-oss-120b', nebius));

    expect(ai.name).toBe('openai:gpt-4.1-mini; nebius:openai/gpt-oss-120b');
    await ai.classifyBrainstorm({ problem: null, ideas: [], request: 'Build a study planner' });
    expect(nebius.parse).toHaveBeenCalledOnce();
    expect(openai.parse).not.toHaveBeenCalled();

    await ai.analyzeConversation({
      messages: [{ id: 'm', authorId: 'a', authorName: 'A', text: 'I will write the README' }],
      tasks: [],
      members: [],
    });
    expect(openai.parse).toHaveBeenCalledOnce();

    await ai.runMention?.({ messages: [{ id: 'm', authorId: 'a', authorName: 'A', text: '@AI what is left?' }], lookup });
    expect(openai.chat).toHaveBeenCalled();
    expect(nebius.chat).not.toHaveBeenCalled();
    expect(vi.mocked(openai.chat).mock.calls[0]?.[0].model).toBe('gpt-4.1-mini');
    vi.mocked(nebius.parse).mockResolvedValue({
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
    expect(vi.mocked(nebius.parse).mock.calls.at(-1)?.[0].model).toBe('openai/gpt-oss-120b');
    expect(openai.parse).toHaveBeenCalledOnce();
  });

  it('sends live meeting ticks to Nebius and the end summary to OpenAI', async () => {
    const openai = client();
    const nebius = client();
    vi.mocked(nebius.parse).mockResolvedValue({
      output: { topic: null, actionItems: [], ideas: [], polls: [], runningSummary: 'Talked.' },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    vi.mocked(openai.parse).mockResolvedValue({
      output: {
        topic: null,
        summary: { overview: 'Done.', decisions: [], openQuestions: [], nextSteps: [] },
        actionItems: [],
        carryOverItems: [],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const meeting = composeMeetingAi(host('openai', 'gpt-4.1-mini', openai), host('nebius', 'openai/gpt-oss-120b', nebius));
    const shared = { lines: [], carryOver: [], ideas: [], taskTitles: [], members: [] };

    await meeting.meetingTick({ ...shared, runningSummary: '', alreadySuggested: [] });
    await meeting.summarizeMeeting({ ...shared, suggestions: [] });

    expect(vi.mocked(nebius.parse).mock.calls[0]?.[0].model).toBe('openai/gpt-oss-120b');
    expect(vi.mocked(openai.parse).mock.calls[0]?.[0].model).toBe('gpt-4.1-mini');
    expect(openai.parse).toHaveBeenCalledOnce();
    expect(nebius.parse).toHaveBeenCalledOnce();
  });
});
