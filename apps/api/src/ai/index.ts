import { config } from '../config.js';
import { mockProvider } from './mock.js';
import type { AiProvider } from './provider.js';

export type { AiProvider } from './provider.js';

// To add a real model: implement AiProvider in a new file (e.g. ./anthropic.ts) that reads its
// API key from the environment, then return it here for AI_PROVIDER=<name>. Keys stay server-side.
const providers: Record<string, AiProvider> = {
  mock: mockProvider,
};

export function getAiProvider(): AiProvider {
  const provider = providers[config.aiProvider];
  if (!provider) {
    throw new Error(`Unknown AI_PROVIDER "${config.aiProvider}". Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
}
