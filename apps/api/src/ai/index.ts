import { config } from '../config.js';
import { runMentionAgent } from './mention-agent.js';
import { mockProvider } from './mock.js';
import { createOpenAiClient } from './openai.js';
import type { AiProvider } from './provider.js';
import { createStructuredProvider } from './structured.js';

export type { AiProvider } from './provider.js';

// An OpenAI-compatible API when OPENAI_API_KEY is set, otherwise the labelled mock. Keys stay server-side.
let provider: AiProvider | null = null;

function pick(): AiProvider {
  if (config.forceMockAi || !config.openaiApiKey) return mockProvider;
  const client = createOpenAiClient(config.openaiApiKey, config.openaiBaseUrl);
  const base = createStructuredProvider(client, config.openaiModel);
  return {
    ...base,
    runMention: (input) => runMentionAgent(client, config.openaiModel, input),
  };
}

export function getAiProvider(): AiProvider {
  provider ??= pick();
  return provider;
}
