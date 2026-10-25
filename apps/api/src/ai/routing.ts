import { config } from '../config.js';
import { runMentionAgent } from './mention-agent.js';
import { createOpenAiClient, type OpenAiClient } from './openai.js';
import type { AiProvider } from './provider.js';
import { createStructuredProvider } from './structured.js';

// Frequent short calls (open-question check, live meeting ticks, board automation) go to Nebius.
// Fewer, longer calls (@AI tools, Ask the project, chat brainstorm drafts, meeting summaries) go to OpenAI.
// One configured host covers both jobs. Neither host means the caller uses the mock.

export interface RoutedModel {
  label: string;
  client: OpenAiClient;
  model: string;
  fastModel: string;
}

export function providerName(heavy: RoutedModel, frequent: RoutedModel): string {
  const heavyName = `${heavy.label}:${heavy.model}`;
  if (heavy.client === frequent.client) return heavyName;
  return `${heavyName}; ${frequent.label}:${frequent.model}`;
}

export function composeAiProvider(heavy: RoutedModel, frequent: RoutedModel): AiProvider {
  const main = createStructuredProvider(heavy.client, heavy.model);
  const quick =
    frequent.client === heavy.client && frequent.model === heavy.model ? main : createStructuredProvider(frequent.client, frequent.model);
  return {
    ...main,
    name: providerName(heavy, frequent),
    detectOpenQuestion: (message) => quick.detectOpenQuestion(message),
    classifyBrainstorm: (input) => quick.classifyBrainstorm(input),
    facilitateBrainstorm: (input) => quick.facilitateBrainstorm(input),
    summarizeResearch: (input) => quick.summarizeResearch(input),
    runMention: (input) => runMentionAgent(heavy.client, heavy.model, input),
  };
}

/** Heavy host first, frequent host second. Null when the mock should run. */
export function routedModels(): { heavy: RoutedModel; frequent: RoutedModel } | null {
  if (config.forceMockAi) return null;
  const openai: RoutedModel | null = config.openaiApiKey
    ? {
        label: 'openai',
        client: createOpenAiClient(config.openaiApiKey, config.openaiBaseUrl),
        model: config.openaiModel,
        fastModel: config.openaiFastModel,
      }
    : null;
  const nebius: RoutedModel | null = config.nebiusApiKey
    ? {
        label: 'nebius',
        client: createOpenAiClient(config.nebiusApiKey, config.nebiusBaseUrl),
        model: config.nebiusModel,
        fastModel: config.nebiusModel,
      }
    : null;
  if (openai && nebius) return { heavy: openai, frequent: nebius };
  const only = openai ?? nebius;
  return only ? { heavy: only, frequent: only } : null;
}
