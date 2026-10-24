import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Idea, Suggestion, WorkspaceSnapshot } from '@project-room/shared';
import { createApp } from './app.js';
import { closeDb, connectDb, getDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { createSuggestion } from './repositories/suggestions.js';
import { migrateLegacyTopics } from './repositories/brainstorm-topics.js';
import { researchWeb } from './services/research.js';
import { runBrainstormAction } from './services/brainstorm.js';
import { rid } from './db/records.js';

vi.mock('./services/research.js', () => ({ researchWeb: vi.fn() }));
let server: Server;
let base: string;
const web = vi.mocked(researchWeb);
beforeAll(async () => {
  await connectDb('mem://');
  await seedDemoData();
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api/projects/hackathon`;
});
beforeEach(async () => {
  await getDb().query('DELETE idea; DELETE suggestion;').collect();
  web.mockReset();
  web.mockResolvedValue({ configured: false, results: [], error: null });
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});
async function call<T>(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-member-id': 'alex' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as T };
}
const topic = async (title = 'Student deadline planning') => (await call<Idea>('POST', '/ideas', { kind: 'problem', title })).body;
const card = async (topicId: string, theme = 'Option') =>
  (await call<Idea>('POST', '/ideas', { topicId, title: 'A concrete approach', theme })).body;
const snapshot = async () => (await call<WorkspaceSnapshot>('GET', '/snapshot')).body;

it('requires a topic and explicit selection when more than one exists', async () => {
  expect((await call('POST', '/ideas', { title: 'Unscoped' })).status).toBe(409);
  expect((await call('POST', '/ideas/actions', { trigger: 'manual' })).status).toBe(409);
  await topic();
  await topic('Second topic');
  expect((await call('POST', '/ideas', { title: 'Ambiguous' })).status).toBe(409);
  expect(web).not.toHaveBeenCalled();
});

it('keeps multiple topics independent, including AI inputs and project membership', async () => {
  const a = await topic();
  const b = await topic('Campus food waste campaign');
  const first = await card(a.id);
  const second = await card(b.id);
  expect(first.topicId).toBe(a.id);
  expect(second.topicId).toBe(b.id);
  expect((await call('POST', '/ideas/actions', { trigger: 'first_idea', topicId: a.id, ideaId: second.id })).status).toBe(409);
  expect((await call('POST', '/ideas', { topicId: first.id, title: 'Not a topic' })).status).toBe(404);
  await getDb()
    .query(
      "CREATE project:other CONTENT { name: 'Other' }; CREATE idea:foreign CONTENT { projectId: project:other, kind: 'problem', title: 'Private', theme: 'Option', authorId: member:alex }; ",
    )
    .collect();
  expect((await call('POST', '/ideas', { topicId: 'foreign', title: 'Cross project' })).status).toBe(404);
  const prepared = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', topicId: a.id });
  expect(prepared.status).toBe(201);
  expect(prepared.body.every((item) => item.topicId === a.id)).toBe(true);
  expect(prepared.body.filter((item) => item.kind === 'idea').every((item) => item.ideaDraft?.theme === 'Strategy')).toBe(true);
});

it('clears direct ideas and drafts but preserves research, saved strategies, strategy drafts and linked tasks', async () => {
  const a = await topic();
  const b = await topic('Another topic');
  const direct = await card(a.id);
  const strategy = await card(a.id, 'Strategy');
  const other = await card(b.id);
  const converted = await call<{ task: { id: string } }>('POST', `/ideas/${direct.id}/convert`, {});
  const research = await createSuggestion('hackathon', {
    kind: 'brainstorm_analysis',
    title: 'Similar work: source',
    reason: 'Evidence',
    proposal: 'Summary',
    ideaId: direct.id,
    researchSources: [{ title: 'Source', url: 'https://example.com/source' }],
  });
  const strategyDraft = await createSuggestion('hackathon', {
    kind: 'idea',
    title: 'Strategy draft',
    reason: 'Plan',
    originIdeaId: direct.id,
    ideaDraft: { title: 'Test with students', description: 'Interview users.', theme: 'Strategy' },
  });
  const draft = await createSuggestion('hackathon', {
    kind: 'idea',
    title: 'Option draft',
    reason: 'Option',
    originIdeaId: direct.id,
    ideaDraft: { title: 'An alternative', description: 'Try another route.', theme: 'Option' },
  });
  expect((await call('POST', `/ideas/${a.id}/clear-ideas`, {})).status).toBe(200);
  const state = await snapshot();
  expect(state.ideas.map((item) => item.id)).toEqual(expect.arrayContaining([a.id, b.id, strategy.id, other.id]));
  expect(state.ideas.some((item) => item.id === direct.id)).toBe(false);
  expect(state.suggestions.find((item) => item.id === research.id)?.ideaId).toBe(a.id);
  expect(state.suggestions.find((item) => item.id === strategyDraft.id)).toMatchObject({ topicId: a.id, originIdeaId: null });
  expect(state.suggestions.some((item) => item.id === draft.id)).toBe(false);
  expect(state.tasks.some((item) => item.id === converted.body.task.id)).toBe(true);
  expect((await call('POST', `/suggestions/${draft.id}/approve`, {})).status).toBe(404);
});

it('changing a topic clears its entire board and deleting a topic leaves the other tab intact', async () => {
  const a = await topic();
  const b = await topic('Another topic');
  await card(a.id);
  await card(a.id, 'Strategy');
  const other = await card(b.id);
  await createSuggestion('hackathon', {
    topicId: a.id,
    kind: 'brainstorm_analysis',
    title: 'Topic research',
    proposal: 'Evidence',
    reason: 'Research',
  });
  const changed = await call<Idea>('PATCH', `/ideas/${a.id}`, { title: 'New research question' });
  expect(changed.status).toBe(200);
  expect(changed.body.boardVersion).toBe(a.boardVersion + 1);
  let state = await snapshot();
  expect(state.ideas.filter((item) => item.topicId === a.id)).toEqual([]);
  expect(state.suggestions.filter((item) => item.topicId === a.id)).toEqual([]);
  await card(a.id);
  expect((await call('DELETE', `/ideas/${a.id}`)).status).toBe(204);
  state = await snapshot();
  expect(state.ideas.map((item) => item.id)).toEqual(expect.arrayContaining([b.id, other.id]));
  expect(state.ideas.some((item) => item.id === a.id || item.topicId === a.id)).toBe(false);
});

it('clearing ideas preserves completed research preparation and does not restart it automatically', async () => {
  const a = await topic();
  const prepared = await runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id });
  expect(prepared.find((item) => item.title === 'Topic research status')?.proposal).toContain('not configured');
  const strategy = prepared.find((item) => item.kind === 'idea')!;
  const saved = await call<Suggestion>('POST', `/suggestions/${strategy.id}/approve`, {});
  expect(saved.status).toBe(200);
  await card(a.id);
  await call('POST', `/ideas/${a.id}/clear-ideas`, {});
  web.mockClear();
  expect(await runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id })).toEqual([]);
  expect(web).not.toHaveBeenCalled();
  expect((await snapshot()).ideas.some((item) => item.theme === 'Strategy' && item.topicId === a.id)).toBe(true);
});

it('requires inbox ideas to choose a topic and binds the approved suggestion to that board', async () => {
  const draft = await createSuggestion('hackathon', {
    kind: 'idea',
    title: 'Chat idea',
    reason: 'Conversation',
    ideaDraft: { title: 'Share a calendar', description: 'A team calendar.', theme: 'Option' },
  });
  expect((await call('POST', `/suggestions/${draft.id}/approve`, {})).status).toBe(409);
  const a = await topic();
  await topic('Another topic');
  expect((await call('POST', `/suggestions/${draft.id}/approve`, {})).status).toBe(409);
  const approved = await call<Suggestion>('POST', `/suggestions/${draft.id}/approve`, { topicId: a.id });
  expect(approved.body.topicId).toBe(a.id);
  expect((await snapshot()).ideas.find((item) => item.sourceSuggestionId === draft.id)?.topicId).toBe(a.id);
});

it('explicit approval of an existing topic change clears its board and preserves the approval record', async () => {
  const a = await topic();
  await card(a.id);
  const draft = await createSuggestion('hackathon', {
    kind: 'brainstorm_topic',
    title: 'Change topic',
    reason: 'Changed direction',
    ideaId: a.id,
    ideaDraft: { title: 'A different direction', description: 'New constraints', theme: 'Option' },
  });
  const approved = await call<Suggestion>('POST', `/suggestions/${draft.id}/approve`, {});
  expect(approved.status).toBe(200);
  expect(approved.body.status).toBe('approved');
  const state = await snapshot();
  expect(state.ideas.find((item) => item.id === a.id)?.title).toBe('A different direction');
  expect(state.ideas.filter((item) => item.topicId === a.id)).toEqual([]);
});

it('coalesces simultaneous topic preparation requests', async () => {
  const a = await topic();
  const [first, second] = await Promise.all([
    runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id }),
    runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id }),
  ]);
  expect(web).toHaveBeenCalledTimes(1);
  expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
});

it.each(['edit', 'delete', 'ideas'] as const)('does not restore stale AI content after %s', async (action) => {
  const a = await topic();
  let release!: (value: Awaited<ReturnType<typeof researchWeb>>) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  web.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const pending = runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id });
  const rejected = expect(pending).rejects.toThrow(/topic/i);
  await ready;
  if (action === 'delete') await call('DELETE', `/ideas/${a.id}`);
  else if (action === 'edit') await call('PATCH', `/ideas/${a.id}`, { title: 'Changed topic' });
  else await call('POST', `/ideas/${a.id}/clear-ideas`, {});
  release({ configured: true, error: null, results: [] });
  await rejected;
  expect((await snapshot()).suggestions.filter((item) => item.topicId === a.id)).toEqual([]);
});

it('keeps existing boards in a legacy topic and does not reassign new inbox drafts on restart', async () => {
  await getDb()
    .query(
      'UPDATE project:hackathon SET brainstormTopicsMigrated = false; CREATE idea:legacy CONTENT { projectId: project:hackathon, title: "Earlier idea", theme: "Product", authorId: member:alex };',
    )
    .collect();
  await migrateLegacyTopics();
  const state = await snapshot();
  const parent = state.ideas.find((item) => item.kind === 'problem')!;
  expect(state.ideas.find((item) => item.id === 'legacy')?.topicId).toBe(parent.id);
  const inbox = await createSuggestion('hackathon', { kind: 'idea', title: 'Choose a topic later', reason: 'Chat draft' });
  await migrateLegacyTopics();
  expect((await snapshot()).suggestions.find((item) => item.id === inbox.id)?.topicId).toBeNull();
  expect(await getDb().select(rid('idea', 'legacy'))).toBeTruthy();
});
