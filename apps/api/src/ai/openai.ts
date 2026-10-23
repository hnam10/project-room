import type Anthropic from '@anthropic-ai/sdk';

// Any OpenAI-compatible chat API (OpenAI, or Groq's free tier via OPENAI_BASE_URL) behind the same
// `messages.parse` shape the Claude providers use, so their prompts and validation are reused as-is.

interface ParseParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user'; content: string }[];
  output_config: { format: { schema: Record<string, unknown>; parse(content: string): unknown } };
}

interface ChatResponse {
  choices: { message: { content: string | null; refusal?: string | null }; finish_reason: string }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export function createOpenAiClient(apiKey: string, baseUrl: string): Pick<Anthropic, 'messages'> {
  async function parse({ model, max_tokens, system, messages, output_config }: ParseParams) {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_completion_tokens: max_tokens,
        messages: [{ role: 'system', content: system }, ...messages],
        response_format: { type: 'json_schema', json_schema: { name: 'output', schema: output_config.format.schema } },
      }),
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as ChatResponse;
    const choice = data.choices[0];
    const content = choice?.message.content;
    return {
      stop_reason: choice?.message.refusal ? 'refusal' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
      parsed_output: content ? output_config.format.parse(content) : null,
      usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
    };
  }
  // The Claude providers only call messages.parse; the cast narrows our adapter to that shape.
  return { messages: { parse } } as unknown as Pick<Anthropic, 'messages'>;
}
