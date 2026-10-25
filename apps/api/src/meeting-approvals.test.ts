import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Idea, Poll, Suggestion, WorkspaceSnapshot } from '@project-room/shared';
import { createApp } from './app.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { listIdeas } from './repositories/ideas.js';
import { listPolls } from './repositories/polls.js';
import { createSuggestion, updateSuggestionDrafts } from './repositories/suggestions.js';

let server: Server;
let base: string;

beforeAll(async () => {
  await connectDb('mem://');
  await seedDemoData();
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

const api = async <T>(path: string, init: RequestInit = {}) => {
  const res = await fetch(`${base}/api/projects/hackathon${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-member-id': 'alex' },
  });
  return { status: res.status, body: (await res.json()) as T };
};
const post = (path: string, body: unknown = {}) => api<Suggestion>(path, { method: 'POST', body: JSON.stringify(body) });

const pollSuggestion = (question = 'Which login?') =>
  createSuggestion('hackathon', { kind: 'poll', title: 'Poll', reason: 'r', pollDraft: { question, options: ['Google', 'Email'] } });

describe('meeting approvals', () => {
  it('approving a poll suggestion opens a poll', async () => {
    const s = await pollSuggestion('Approve me?');
    const res = await post(`/suggestions/${s.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    const poll = (await listPolls('hackathon', null)).find((p) => p.question === 'Approve me?')!;
    expect(poll.options.map((o) => o.label)).toEqual(['Google', 'Email']);
    expect(poll.options.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(poll.status).toBe('open');
    expect(poll.createdById).toBe('alex');
    expect(poll.sourceSuggestionId).toBe(s.id);
  });

  it('approving a new-idea suggestion creates an idea; develop updates only the description', async () => {
    const s = await createSuggestion('hackathon', {
      kind: 'idea',
      title: 'Idea',
      reason: 'r',
      ideaDraft: { title: 'Offline mode', description: 'Works on trains', theme: 'Product' },
    });
    await post(`/suggestions/${s.id}/approve`);
    const created = (await listIdeas('hackathon')).find((i) => i.title === 'Offline mode')!;
    expect(created.description).toBe('Works on trains');
    expect(created.theme).toBe('Product');

    const dev = await createSuggestion('hackathon', {
      kind: 'idea',
      title: 'Develop',
      reason: 'r',
      ideaId: created.id,
      ideaDraft: { title: 'Ignored', description: 'Sync when back online', theme: 'Platform' },
    });
    await post(`/suggestions/${dev.id}/approve`);
    const after = (await listIdeas('hackathon')).find((i) => i.id === created.id) as Idea;
    expect(after.title).toBe('Offline mode');
    expect(after.theme).toBe('Product');
    expect(after.description).toBe('Sync when back online');
  });

  it('develop of an idea outside the project is not found', async () => {
    const dev = await createSuggestion('hackathon', {
      kind: 'idea',
      title: 'Develop',
      reason: 'r',
      ideaId: 'does-not-exist',
      ideaDraft: { title: 'x', description: 'y', theme: 'Product' },
    });
    expect((await post(`/suggestions/${dev.id}/approve`)).status).toBe(404);
  });

  it('PATCH edits a draft before approval and rejects edits after', async () => {
    const s = await pollSuggestion();
    const edited = await api<Suggestion>(`/suggestions/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pollDraft: { question: 'Edited?', options: ['A', 'B', 'C'] } }),
    });
    expect(edited.status).toBe(200);
    expect(edited.body.pollDraft?.question).toBe('Edited?');
    await post(`/suggestions/${s.id}/approve`);
    const again = await api(`/suggestions/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pollDraft: { question: 'Late', options: ['A', 'B'] } }),
    });
    expect(again.status).toBe(409);
  });

  it('PATCH rejects a draft that does not match the suggestion kind', async () => {
    const s = await pollSuggestion();
    const res = await api(`/suggestions/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ideaDraft: { title: 'x', description: '', theme: 'Product' } }),
    });
    expect(res.status).toBe(400);
  });

  it('patching one draft leaves the other unchanged', async () => {
    const s = await createSuggestion('hackathon', {
      kind: 'idea',
      title: 'Idea',
      reason: 'r',
      ideaDraft: { title: 'A', description: 'd', theme: 'Product' },
      pollDraft: { question: 'Q?', options: ['x', 'y'] },
    });
    const u = await updateSuggestionDrafts(s.id, { ideaDraft: { title: 'B', description: 'e', theme: 'Product' } });
    expect(u.ideaDraft?.title).toBe('B');
    expect(u.pollDraft).toEqual({ question: 'Q?', options: ['x', 'y'] });
  });

  it('voting moves a vote, rejects unknown options and closed polls', async () => {
    const s = await pollSuggestion('Vote?');
    await post(`/suggestions/${s.id}/approve`);
    const poll = (await listPolls('hackathon', null)).find((p) => p.question === 'Vote?')!;
    const vote = (optionId: string) => api<Poll>(`/polls/${poll.id}/vote`, { method: 'POST', body: JSON.stringify({ optionId }) });
    await vote('o1');
    const moved = await vote('o2');
    expect(moved.body.options[0]!.voterIds).toEqual([]);
    expect(moved.body.options[1]!.voterIds).toEqual(['alex']);
    expect((await vote('o9')).status).toBe(400);
    const closed = await api<Poll>(`/polls/${poll.id}/close`, { method: 'POST' });
    expect(closed.body.status).toBe('closed');
    expect((await vote('o1')).status).toBe(409);
    const final = (await listPolls('hackathon', null)).find((p) => p.id === poll.id)!;
    expect(final.options[1]!.voterIds).toEqual(['alex']);
    // The Polls tab reads polls from the project snapshot, closed ones included.
    const snapshot = (await api<WorkspaceSnapshot>('/snapshot')).body;
    expect(snapshot.polls.find((p) => p.id === poll.id)).toMatchObject({ status: 'closed' });
    expect((await api(`/polls/nope/vote`, { method: 'POST', body: JSON.stringify({ optionId: 'o1' }) })).status).toBe(404);
  });

  it('approving twice is a conflict', async () => {
    const s = await pollSuggestion();
    await post(`/suggestions/${s.id}/approve`);
    expect((await post(`/suggestions/${s.id}/approve`)).status).toBe(409);
  });
});
