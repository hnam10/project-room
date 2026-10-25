import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAiClient } from './openai.js';
import { createStructuredProvider } from './structured.js';
import { z } from 'zod';

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible client', () => {
  it('retries provider JSON-generation errors with correction feedback', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'json_validate_failed', message: 'Generated JSON does not match the expected schema: expected object' },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":"Valid JSON"}' } }] })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = createOpenAiClient('key', 'https://example.test/v1');
    const result = await client.parse({
      model: 'test',
      maxTokens: 100,
      system: 'Return JSON.',
      content: 'A sample request',
      schema: z.object({ answer: z.string() }),
    });
    expect(result.output).toEqual({ answer: 'Valid JSON' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(retry.messages[1].content).toContain('JSON validation correction');
    expect(retry.messages[1].content).toContain('A sample request');
  });

  it('bounds malformed-output retries and does not accept invalid JSON', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":12}' } }] }))),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = createOpenAiClient('key', 'https://example.test/v1');
    await expect(
      client.parse({ model: 'test', maxTokens: 100, system: 'Return JSON.', content: 'Sample', schema: z.object({ answer: z.string() }) }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 429, 500])('does not retry request/auth/service errors (%s)', async (status) => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message: 'Request rejected' } }), { status })));
    vi.stubGlobal('fetch', fetchMock);
    const client = createOpenAiClient('key', 'https://example.test/v1');
    await expect(
      client.parse({ model: 'test', maxTokens: 100, system: 'Return JSON.', content: 'Sample', schema: z.object({ answer: z.string() }) }),
    ).rejects.toThrow(String(status));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the schema as response_format and feeds the JSON reply through validation', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: { content: JSON.stringify({ mode: 'sideways' }) },
              },
            ],
          }),
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ai = createStructuredProvider(createOpenAiClient('key', 'https://example.test/v1/'), 'gpt-test');
    const out = await ai.classifyBrainstorm({ problem: null, ideas: [], request: 'Plan a launch party' });

    // An unknown value from the model is normalised, not trusted.
    expect(out).toBe('unclear');
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
      Promise.resolve(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '{"mode":"product"}' } }] }))),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ai = createStructuredProvider(createOpenAiClient('key', 'https://api.openai.com/v1'), 'gpt-test');
    await ai.classifyBrainstorm({ problem: null, ideas: [], request: 'q' });
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
            choices: [{ finish_reason: 'stop', message: { content: '```json\n{"mode":"non_product"}\n```' } }],
          }),
        ),
      ),
    );
    const ai = createStructuredProvider(createOpenAiClient('key', 'https://api.tokenfactory.nebius.com/v1'), 'gpt-test');
    expect(await ai.classifyBrainstorm({ problem: null, ideas: [], request: 'Plan a launch party' })).toBe('non_product');
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
    await expect(ai.classifyBrainstorm({ problem: null, ideas: [], request: 'q' })).rejects.toThrow('429');
  });
});
