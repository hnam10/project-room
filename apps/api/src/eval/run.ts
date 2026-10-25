// Action-item extraction eval: runs each configured AI host over a dataset of conversations with an answer key
// and prints how many expected items it found, how many it invented, and how often it picked the right owner.
//
//   npm run eval -w apps/api                       # the hand-written sample
//   npm run eval -w apps/api -- data.json --details  # another dataset, with per-case misses and extras
//
// Dataset: { "source": "...", "cases": [{ "id", "members": [{ "id", "name" }], "messages": [{ "author", "text" }],
// "expected": [{ "title", "assignee" }] }] }. An Era export gets converted to this shape.

import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import { mockProvider } from '../ai/mock.js';
import { createOpenAiClient } from '../ai/openai.js';
import type { AiProvider, ConversationMessage, ProjectLookup } from '../ai/provider.js';
import { composeAiProvider } from '../ai/routing.js';
import { matchItems, rates, scoreCase, sum, type ExpectedItem, type Score } from './score.js';

interface EvalCase {
  id: string;
  members: { id: string; name: string; role?: string }[];
  messages: { author: string; text: string }[];
  expected: ExpectedItem[];
}

const args = process.argv.slice(2);
const details = args.includes('--details');
const path = args.find((a) => !a.startsWith('--')) ?? new URL('./sample.json', import.meta.url);
const dataset = JSON.parse(await readFile(path, 'utf8')) as { source?: string; cases: EvalCase[] };

// Each host is built the way getAiProvider() builds it, so real hosts answer through runMention like @AI in chat.
const host = (label: string, apiKey: string, baseUrl: string, model: string): [string, AiProvider] => {
  const routed = { label, client: createOpenAiClient(apiKey, baseUrl), model, fastModel: model };
  return [`${label}:${model}`, composeAiProvider(routed, routed)];
};
const providers: [string, AiProvider][] = [['mock', mockProvider]];
if (config.openaiApiKey) providers.push(host('openai', config.openaiApiKey, config.openaiBaseUrl, config.openaiModel));
if (config.nebiusApiKey) providers.push(host('nebius', config.nebiusApiKey, config.nebiusBaseUrl, config.nebiusModel));

/** The same call ai-engine makes for an @AI mention: the agent when the host has one, the one-shot analysis otherwise. */
async function actionItems(ai: AiProvider, c: EvalCase, messages: ConversationMessage[]) {
  const members = c.members.map((m) => ({ id: m.id, name: m.name, role: m.role ?? '' }));
  if (!ai.runMention) return (await ai.analyzeConversation({ messages, tasks: [], members })).actionItems;
  // An empty project apart from the case's members: no tasks, ideas or older messages to look up.
  const lookup: ProjectLookup = {
    listMembers: async () => members,
    listTasks: async () => [],
    searchMessages: async () => [],
    listPendingSuggestions: async () => [],
    listIdeas: async () => [],
  };
  // A case may list no members; the question then comes from an unnamed teammate, still through the agent.
  const asker = c.members[0] ?? { id: 'eval', name: 'Teammate' };
  const ask = { id: `${c.id}-ask`, authorId: asker.id, authorName: asker.name, text: '@AI what are our action items?' };
  return (await ai.runMention({ messages: [...messages, ask], lookup })).actionItems;
}

console.log(`Dataset: ${dataset.source ?? path} (${dataset.cases.length} cases)\n`);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const rows = [];

for (const [name, ai] of providers) {
  const scores: Score[] = [];
  let failed = 0;
  const started = Date.now();
  for (const c of dataset.cases) {
    const nameOf = (id: string) => c.members.find((m) => m.id === id)?.name ?? id;
    let proposed: { title: string; assigneeId: string | null }[];
    try {
      const messages = c.messages.map((m, i) => ({ id: `${c.id}-${i}`, authorId: m.author, authorName: nameOf(m.author), text: m.text }));
      proposed = await actionItems(ai, c, messages);
    } catch (error) {
      failed++;
      console.error(`${name} failed on ${c.id}:`, error instanceof Error ? error.message : error);
      // A failed call (rate limit, timeout) says nothing about extraction; it only shows in the failed column.
      continue;
    }
    scores.push(scoreCase(c.expected, proposed));
    if (details) {
      // The same pairing as the score, so the lists add up to the table.
      const pairs = matchItems(c.expected, proposed);
      const paired = new Set(pairs.values());
      const missed = c.expected.filter((_, e) => !paired.has(e)).map((e) => e.title);
      const extra = proposed.filter((_, p) => !pairs.has(p)).map((p) => p.title);
      if (missed.length || extra.length)
        console.log(`[${name}] ${c.id}\n  missed: ${missed.join(' | ') || '-'}\n  extra:  ${extra.join(' | ') || '-'}`);
    }
  }
  const total = sum(scores);
  const r = rates(total);
  // Every call failed: there is nothing to score, so show '-' rather than a misleading 0%.
  const shown = (n: number) => (scores.length ? pct(n) : '-');
  rows.push({
    provider: name,
    expected: total.expected,
    proposed: total.proposed,
    found: total.matched,
    precision: shown(r.precision),
    recall: shown(r.recall),
    f1: shown(r.f1),
    assignee: shown(r.assignee),
    failed,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
  });
}

if (details) console.log();
console.table(rows);
if (providers.length === 1)
  console.log('Only the mock ran: set OPENAI_API_KEY and/or NEBIUS_API_KEY in apps/api/.env to compare real models.');
