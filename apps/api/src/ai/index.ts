import { mockProvider } from './mock.js';
import type { AiProvider } from './provider.js';
import { composeAiProvider, routedModels } from './routing.js';

export type { AiProvider } from './provider.js';

// OpenAI for the longer calls and Nebius for the frequent ones, when each key is set. Otherwise the
// labelled mock. Keys stay server-side.
let provider: AiProvider | null = null;

function pick(): AiProvider {
  const hosts = routedModels();
  if (!hosts) return mockProvider;
  return composeAiProvider(hosts.heavy, hosts.frequent);
}

export function getAiProvider(): AiProvider {
  provider ??= pick();
  return provider;
}
