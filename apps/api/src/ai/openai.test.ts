import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiClient } from './openai.js';
import { createStructuredProvider } from './structured.js';

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible client', () => {
  it('sends the schema as response_format and feeds the JSON reply through validation', async () => {
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
    const ai = createStructuredProvider(createOpenAiClient('key', 'https://example.test/v1/'), 'gpt-test');
    const decision = { id: 'd1', title: 'Database', outcome: 'SurrealDB', reason: null, decidedAt: null, decidedById: null };
    const out = await ai.answerFromDecisions({ question: 'Which DB?', decisions: [decision as never], members: [] });

    expect(out).toEqual({ answer: 'Use SurrealDB.', sourceDecisionIds: ['d1'] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/v1/chat/completions');
    const body = JSON.parse(init.body as string) as {
      model: string;
      max_tokens?: number;
      max_completion_tokens?: number;
      response_format: { type: string; json_schema: { strict: boolean; name: string } };
    };
    expect(body.model).toBe('gpt-test');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema).toMatchObject({ name: 'output', strict: true });
    expect(body.max_tokens).toEqual(expect.any(Number));
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('asks api.openai.com for max_completion_tokens', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":"x","sourceDecisionIds":[]}' } }] }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ai = createStructuredProvider(createOpenAiClient('key', 'https://api.openai.com/v1'), 'gpt-test');
    const decision = { id: 'd1', title: 'Database', outcome: 'SurrealDB', reason: null, decidedAt: null, decidedById: null };
    await ai.answerFromDecisions({ question: 'q', decisions: [decision as never], members: [] });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      max_tokens?: number;
      max_completion_tokens?: number;
    };
    expect(body.max_completion_tokens).toEqual(expect.any(Number));
    expect(body.max_tokens).toBeUndefined();
  });

  it('strips a JSON fence before validation', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              { finish_reason: 'stop', message: { content: '```json\n{"answer":"Use SurrealDB.","sourceDecisionIds":["d1"]}\n```' } },
            ],
          }),
        ),
      ),
    );
    const ai = createStructuredProvider(createOpenAiClient('key', 'https://api.tokenfactory.nebius.com/v1'), 'gpt-test');
    const decision = { id: 'd1', title: 'Database', outcome: 'SurrealDB', reason: null, decidedAt: null, decidedById: null };
    const out = await ai.answerFromDecisions({ question: 'Which DB?', decisions: [decision as never], members: [] });
    expect(out.sourceDecisionIds).toEqual(['d1']);
  });

  it('sends tools and returns tool calls for Nebius-style hosts', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'tool_calls',
                message: { content: null, tool_calls: [{ id: 'call_1', function: { name: 'list_tasks', arguments: '{"status":""}' } }] },
              },
            ],
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createOpenAiClient('key', 'https://api.tokenfactory.nebius.com/v1/');
    const out = await client.chat({
      model: 'openai/gpt-oss-120b',
      maxTokens: 100,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'list_tasks', description: 'tasks', parameters: { type: 'object' } } }],
    });
    expect(out.toolCalls).toEqual([{ id: 'call_1', name: 'list_tasks', arguments: '{"status":""}' }]);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as {
      max_tokens: number;
      tool_choice: string;
    };
    expect(body.max_tokens).toBe(100);
    expect(body.tool_choice).toBe('auto');
  });

  it('turns an HTTP error into a thrown error', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('rate limited', { status: 429 })));
    const ai = createStructuredProvider(createOpenAiClient('key', 'https://example.test/v1'), 'gpt-test');
    await expect(ai.answerFromDecisions({ question: 'q', decisions: [{ id: 'd1' } as never], members: [] })).rejects.toThrow('429');
  });
});
