import { z } from 'zod';

// Any OpenAI-compatible chat API (api.openai.com, Nebius Token Factory, Groq).
// api.openai.com expects max_completion_tokens; the others expect max_tokens.

interface FunctionCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ChatTool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface ChatResponse {
  choices: {
    message: {
      content: string | null;
      refusal?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[];
    };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface StructuredRequest<T> {
  model: string;
  maxTokens: number;
  system: string;
  content: string;
  schema: z.ZodType<T>;
}

export interface StructuredResult<T> {
  output: T;
  usage: { inputTokens: number; outputTokens: number };
}

/** Cheap models often wrap JSON in a fence even when a schema was requested. */
function jsonText(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function tokenLimit(baseUrl: string, maxTokens: number): Record<string, number> {
  try {
    if (new URL(baseUrl).host === 'api.openai.com') return { max_completion_tokens: maxTokens };
  } catch {
    // A base URL that is not a URL is not OpenAI, so use the field Nebius and Groq accept.
  }
  return { max_tokens: maxTokens };
}

/** JSON Schema for `response_format`. `$schema` is dropped because strict mode rejects it. */
function responseSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export interface OpenAiClient {
  parse<T>(input: StructuredRequest<T>): Promise<StructuredResult<T>>;
  chat(input: { model: string; maxTokens: number; messages: ChatMessage[]; tools: ChatTool[] }): Promise<{
    content: string | null;
    toolCalls: FunctionCall[];
  }>;
}

/** A provider generated invalid JSON, rather than rejecting the request schema or credentials. */
class StructuredGenerationError extends Error {}

export function createOpenAiClient(apiKey: string, baseUrl: string): OpenAiClient {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  async function post(body: Record<string, unknown>): Promise<ChatResponse> {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 && body.response_format) {
        try {
          const error = JSON.parse(text).error;
          if (error?.code === 'json_validate_failed' || /generated json does not match|failed to generate json/i.test(error?.message ?? ''))
            throw new StructuredGenerationError(`The generated JSON did not match the schema: ${String(error.message).slice(0, 600)}`);
        } catch (error) {
          if (error instanceof StructuredGenerationError) throw error;
        }
      }
      throw new Error(`AI request failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return (await res.json()) as ChatResponse;
  }

  async function parse<T>({ model, maxTokens, system, content, schema }: StructuredRequest<T>): Promise<StructuredResult<T>> {
    let correction = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await post({
          model,
          ...tokenLimit(baseUrl, maxTokens),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: content + correction },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'output', strict: true, schema: responseSchema(schema) },
          },
        });
        const choice = data.choices[0];
        if (choice?.message.refusal) throw new Error('The model declined this request');
        if (choice?.finish_reason === 'length') throw new Error('The model’s answer was cut off');
        if (!choice?.message.content) throw new Error('The model returned no structured output');
        return {
          output: schema.parse(JSON.parse(jsonText(choice.message.content))) as T,
          usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
        };
      } catch (error) {
        const invalidJson = error instanceof StructuredGenerationError || error instanceof z.ZodError || error instanceof SyntaxError;
        if (!invalidJson || attempt === 2) throw error;
        const feedback =
          error instanceof z.ZodError
            ? error.issues
                .slice(0, 8)
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join('; ')
            : error.message;
        correction = `\n\nJSON validation correction: ${feedback}\nGenerate a fresh response matching the exact supplied JSON schema. Keep strings short and use the required object/array types. No code fences or extra fields.`;
      }
    }
    throw new Error('The model could not produce valid structured output');
  }

  async function chat(input: { model: string; maxTokens: number; messages: ChatMessage[]; tools: ChatTool[] }) {
    const data = await post({
      model: input.model,
      ...tokenLimit(baseUrl, input.maxTokens),
      messages: input.messages,
      tools: input.tools,
      tool_choice: 'auto',
    });
    const choice = data.choices[0];
    if (choice?.finish_reason === 'length') throw new Error('The model’s answer was cut off');
    const toolCalls: FunctionCall[] = (choice?.message.tool_calls ?? [])
      .map((call, index) => ({
        id: call.id || `call_${index}`,
        name: call.function?.name ?? '',
        arguments: typeof call.function?.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function?.arguments ?? {}),
      }))
      .filter((call) => call.name);
    return { content: choice?.message.content ?? null, toolCalls };
  }

  return { parse, chat };
}
