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
import type { AiProvider } from '../ai/provider.js';
import { createStructuredProvider } from '../ai/structured.js';
import { MATCH_AT, rates, scoreCase, similarity, sum, type ExpectedItem, type Score } from './score.js';

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

const providers: [string, AiProvider][] = [['mock', mockProvider]];
if (config.openaiApiKey) {
  providers.push([
    `openai:${config.openaiModel}`,
    createStructuredProvider(createOpenAiClient(config.openaiApiKey, config.openaiBaseUrl), config.openaiModel),
  ]);
}
if (config.nebiusApiKey) {
  providers.push([
    `nebius:${config.nebiusModel}`,
    createStructuredProvider(createOpenAiClient(config.nebiusApiKey, config.nebiusBaseUrl), config.nebiusModel),
  ]);
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
    let proposed: { title: string; assigneeId: string | null }[] = [];
    try {
      const out = await ai.analyzeConversation({
        messages: c.messages.map((m, i) => ({ id: `${c.id}-${i}`, authorId: m.author, authorName: nameOf(m.author), text: m.text })),
        tasks: [],
        members: c.members.map((m) => ({ id: m.id, name: m.name, role: m.role ?? '' })),
      });
      proposed = out.actionItems;
    } catch (error) {
      failed++;
      console.error(`${name} failed on ${c.id}:`, error instanceof Error ? error.message : error);
    }
    scores.push(scoreCase(c.expected, proposed));
    if (details) {
      const missed = c.expected.filter((e) => !proposed.some((p) => similarity(e.title, p.title) >= MATCH_AT)).map((e) => e.title);
      const extra = proposed.filter((p) => !c.expected.some((e) => similarity(e.title, p.title) >= MATCH_AT)).map((p) => p.title);
      if (missed.length || extra.length)
        console.log(`[${name}] ${c.id}\n  missed: ${missed.join(' | ') || '-'}\n  extra:  ${extra.join(' | ') || '-'}`);
    }
  }
  const total = sum(scores);
  const r = rates(total);
  rows.push({
    provider: name,
    expected: total.expected,
    proposed: total.proposed,
    found: total.matched,
    precision: pct(r.precision),
    recall: pct(r.recall),
    f1: pct(r.f1),
    assignee: pct(r.assignee),
    failed,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
  });
}

if (details) console.log();
console.table(rows);
if (providers.length === 1)
  console.log('Only the mock ran: set OPENAI_API_KEY and/or NEBIUS_API_KEY in apps/api/.env to compare real models.');
