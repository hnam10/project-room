import { config } from '../config.js';
import { createAnthropicProvider } from './anthropic.js';
import { mockProvider } from './mock.js';
import { createOpenAiClient } from './openai.js';
import type { AiProvider } from './provider.js';

export type { AiProvider } from './provider.js';

// An OpenAI-compatible API when OPENAI_API_KEY is set, else Claude when ANTHROPIC_API_KEY is set, else the
// labelled mock. Keys stay server-side.
let provider: AiProvider | null = null;

function pick(): AiProvider {
  if (config.forceMockAi) return mockProvider;
  if (config.openaiApiKey) {
    const client = createOpenAiClient(config.openaiApiKey, config.openaiBaseUrl);
    return { ...createAnthropicProvider('', config.openaiModel, client), name: `openai:${config.openaiModel}` };
  }
  if (config.anthropicApiKey) return createAnthropicProvider(config.anthropicApiKey, config.anthropicModel);
  return mockProvider;
}

export function getAiProvider(): AiProvider {
  provider ??= pick();
  return provider;
}
