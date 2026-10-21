import { config } from '../config.js';
import { createAnthropicProvider } from './anthropic.js';
import { mockProvider } from './mock.js';
import type { AiProvider } from './provider.js';

export type { AiProvider } from './provider.js';

// Claude when ANTHROPIC_API_KEY is set, otherwise the labelled mock. The key stays server-side.
let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  provider ??=
    config.anthropicApiKey && !config.forceMockAi ? createAnthropicProvider(config.anthropicApiKey, config.anthropicModel) : mockProvider;
  return provider;
}
