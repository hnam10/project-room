import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAiClient } from './openai.js';

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible client', () => {
  it('sends the schema as response_format and feeds the JSON reply through the Claude provider’s validation', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: JSON.stringify({ answer: 'Use SurrealDB.', sourceDecisionIds: ['d1', 'ghost'] }) },
              },
            ],
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ai = createAnthropicProvider('', 'gpt-test', createOpenAiClient('key', 'https://example.test/v1/'));
    const decision = { id: 'd1', title: 'Database', outcome: 'SurrealDB', reason: null, decidedAt: null, decidedById: null };
    const out = await ai.answerFromDecisions({ question: 'Which DB?', decisions: [decision as never], members: [] });

    expect(out).toEqual({ answer: 'Use SurrealDB.', sourceDecisionIds: ['d1'] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/v1/chat/completions');
    const body = JSON.parse(init.body as string) as { model: string; response_format: { type: string } };
    expect(body.model).toBe('gpt-test');
    expect(body.response_format.type).toBe('json_schema');
  });

  it('turns an HTTP error into a thrown error', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('rate limited', { status: 429 })));
    const ai = createAnthropicProvider('', 'gpt-test', createOpenAiClient('key', 'https://example.test/v1'));
    await expect(ai.answerFromDecisions({ question: 'q', decisions: [{ id: 'd1' } as never], members: [] })).rejects.toThrow('429');
  });
});
