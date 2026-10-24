import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { Decision, Idea, MemoryAnswer, Project, ServerMessage, Suggestion, Task, WorkspaceSnapshot } from '@project-room/shared';
import { createApp } from './app.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { startRealtime, type RealtimeHub } from './realtime/hub.js';

let server: Server;
let hub: RealtimeHub;
let base: string;

beforeAll(async () => {
  const db = await connectDb('mem://');
  await seedDemoData();
  server = createServer(createApp());
  hub = await startRealtime(server, db);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await hub.close();
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});

const api = async <T>(path: string, init: RequestInit & { member?: string } = {}) => {
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-member-id': init.member ?? 'alex' },
  });
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as T };
};

function listen(projectId: string) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?member=alex`);
  const events: ServerMessage[] = [];
  ws.on('message', (raw) => events.push(JSON.parse(String(raw))));
  const ready = new Promise<void>((resolve) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'subscribe', projectId })));
    ws.on('message', (raw) => JSON.parse(String(raw)).type === 'ready' && resolve());
  });
  const waitFor = async (predicate: (e: ServerMessage) => boolean, timeout = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const hit = events.find(predicate);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('Timed out waiting for realtime event');
  };
  return { ws, ready, waitFor };
}

describe('workspace API', () => {
  it('returns the seeded snapshot for a member', async () => {
    const { status, body } = await api<WorkspaceSnapshot>('/projects/hackathon/snapshot');
    expect(status).toBe(200);
    expect(body.tasks).toHaveLength(15);
    expect(body.channels.map((c) => c.name)).toContain('general');
    expect(body.suggestions.find((s) => s.id === 's1')?.items[0]?.assigneeId).toBe('jamie');
  });

  it('keeps other people out of the project', async () => {
    const { status } = await api('/projects/hackathon/snapshot', { member: 'stranger' });
    expect(status).toBe(403);
  });

  it('sets and clears the project deadline', async () => {
    const before = await api<WorkspaceSnapshot>('/projects/hackathon/snapshot');
    const denied = await api('/projects/hackathon', {
      method: 'PATCH',
      member: 'stranger',
      body: JSON.stringify({ dueDate: '2026-12-01' }),
    });
    expect(denied.status).toBe(403);

    const set = await api<Project>('/projects/hackathon', {
      method: 'PATCH',
      body: JSON.stringify({ dueDate: '2026-12-01' }),
    });
    expect(set.status).toBe(200);
    expect(set.body.dueDate).toBe('2026-12-01');
    expect(set.body.name).toBe('Hackathon 2026');

    for (const dueDate of ['soon', '2026-02-30', '2026-02-29', '1900-02-29', '2026-04-31']) {
      const bad = await api('/projects/hackathon', { method: 'PATCH', body: JSON.stringify({ dueDate }) });
      expect(bad.status).toBe(400);
    }
    const unchanged = await api<WorkspaceSnapshot>('/projects/hackathon/snapshot');
    expect(unchanged.body.project.dueDate).toBe('2026-12-01');

    const cleared = await api<Project>('/projects/hackathon', { method: 'PATCH', body: JSON.stringify({ dueDate: null }) });
    expect(cleared.status).toBe(200);
    expect(cleared.body.dueDate).toBeNull();

    const restored = await api<Project>('/projects/hackathon', {
      method: 'PATCH',
      body: JSON.stringify({ dueDate: before.body.project.dueDate }),
    });
    expect(restored.status).toBe(200);
    expect(restored.body.dueDate).toBe(before.body.project.dueDate);
  });

  it('validates task input', async () => {
    const { status } = await api('/projects/hackathon/tasks', { method: 'POST', body: JSON.stringify({ title: '', status: 'nope' }) });
    expect(status).toBe(400);
  });

  it('numbers new tasks after the existing ones and supports edit/delete', async () => {
    const created = await api<Task>('/projects/hackathon/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Write README', assigneeId: 'morgan' }),
    });
    expect(created.status).toBe(201);
    expect(created.body.num).toBe(19);
    const moved = await api<Task>(`/projects/hackathon/tasks/${created.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    });
    expect(moved.body.status).toBe('done');
    expect((await api(`/projects/hackathon/tasks/${created.body.id}`, { method: 'DELETE' })).status).toBe(204);
  });

  it('goes from conversation to AI suggestion to approved tasks, live', async () => {
    const live = listen('hackathon');
    await live.ready;

    await api('/projects/hackathon/channels/hackathon-general/messages', {
      method: 'POST',
      body: JSON.stringify({ text: "I'll build the pitch deck. We still need to book a demo room. @AI any tasks?" }),
    });

    const created = (await live.waitFor(
      (e) => e.type === 'change' && e.table === 'suggestion' && e.action === 'create' && e.record.kind === 'action_items',
    )) as Extract<ServerMessage, { table: 'suggestion' }>;
    const suggestion: Suggestion = created.record;
    expect(suggestion.status).toBe('pending');
    expect(suggestion.items.map((i) => i.title)).toEqual(['Build pitch deck', 'Book a demo room']);
    await live.waitFor((e) => e.type === 'change' && e.table === 'message' && e.record.suggestionId === suggestion.id);

    // Nothing is on the board until someone approves.
    const before = await api<Task[]>('/projects/hackathon/tasks');
    expect(before.body.some((t) => t.title === 'Build pitch deck')).toBe(false);

    const approved = await api<Suggestion>(`/projects/hackathon/suggestions/${suggestion.id}/approve`, { method: 'POST', body: '{}' });
    expect(approved.body.status).toBe('approved');
    expect(approved.body.createdTaskIds).toHaveLength(2);
    await live.waitFor((e) => e.type === 'change' && e.table === 'task' && e.record.title === 'Book a demo room');

    const again = await api(`/projects/hackathon/suggestions/${suggestion.id}/approve`, { method: 'POST', body: '{}' });
    expect(again.status).toBe(409);
    live.ws.close();
  });

  it('turns an AI-guided chat brainstorm into a reviewed idea, then explicitly opens voting', async () => {
    const live = listen('hackathon');
    await live.ready;

    await api('/projects/hackathon/channels/hackathon-general/messages', {
      method: 'POST',
      body: JSON.stringify({ text: '@AI brainstorm ways to reduce food waste on campus' }),
    });

    const event = (await live.waitFor(
      (candidate) => candidate.type === 'change' && candidate.table === 'suggestion' && candidate.record.kind === 'idea',
    )) as Extract<ServerMessage, { table: 'suggestion' }>;
    const suggestion = event.record;
    expect(suggestion.status).toBe('pending');
    expect(suggestion.ideaDraft?.title.toLowerCase()).toContain('reduce food waste');
    expect(suggestion.ideaDraft?.theme).toBe('Strategy');
    expect(suggestion.researchSources).toEqual([]);

    const topicSuggestion = (await api<Suggestion[]>('/projects/hackathon/suggestions')).body.find(
      (item) => item.kind === 'brainstorm_topic' && item.status === 'pending',
    );
    expect(topicSuggestion?.ideaDraft?.title.toLowerCase()).toContain('reduce food waste');
    expect(topicSuggestion?.ideaId).toBeNull();
    expect((await api<Idea[]>('/projects/hackathon/ideas')).body.some((candidate) => candidate.kind === 'problem')).toBe(false);
    await api(`/projects/hackathon/suggestions/${topicSuggestion!.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ideaDraft: { ...topicSuggestion!.ideaDraft, description: 'Focus on campus dining surplus.' } }),
    });
    expect(
      (await api<Suggestion>(`/projects/hackathon/suggestions/${topicSuggestion!.id}/approve`, { method: 'POST', body: '{}' })).body.status,
    ).toBe('approved');
    const topic = (await api<Idea[]>('/projects/hackathon/ideas')).body.find((candidate) => candidate.kind === 'problem');
    expect(topic).toMatchObject({ description: 'Focus on campus dining surplus.' });

    const before = await api<Idea[]>('/projects/hackathon/ideas');
    expect(before.body.some((idea) => idea.title === suggestion.ideaDraft?.title)).toBe(false);

    const approved = await api<Suggestion>(`/projects/hackathon/suggestions/${suggestion.id}/approve`, { method: 'POST', body: '{}' });
    expect(approved.body.status).toBe('approved');
    const ideas = await api<Idea[]>('/projects/hackathon/ideas');
    const idea = ideas.body.find((candidate) => candidate.title === suggestion.ideaDraft?.title);
    expect(idea?.votingOpen).toBe(false);
    expect(idea?.sourceSuggestionId).toBe(suggestion.id);

    expect((await api(`/projects/hackathon/ideas/${idea!.id}/vote`, { method: 'POST' })).status).toBe(409);
    const opened = await api<Idea>(`/projects/hackathon/ideas/${idea!.id}/start-vote`, { method: 'POST' });
    expect(opened.body.votingOpen).toBe(true);
    const voted = await api<Idea>(`/projects/hackathon/ideas/${idea!.id}/vote`, { method: 'POST' });
    expect(voted.body.voterIds).toContain('alex');

    await live.waitFor((candidate) => candidate.type === 'change' && candidate.table === 'message' && candidate.record.authorId === 'ai');
    await api('/projects/hackathon/channels/hackathon-general/messages', {
      method: 'POST',
      body: JSON.stringify({ text: '@AI brainstorm what should we eat for dinner?' }),
    });
    const updatedTopic = (await live.waitFor(
      (candidate) =>
        candidate.type === 'change' &&
        candidate.table === 'suggestion' &&
        candidate.record.kind === 'brainstorm_topic' &&
        candidate.record.title.toLowerCase().includes('dinner'),
    )) as Extract<ServerMessage, { table: 'suggestion' }>;
    expect(updatedTopic.record.ideaId).toBe(topic?.id);
    await api(`/projects/hackathon/suggestions/${updatedTopic.record.id}/approve`, { method: 'POST', body: '{}' });
    const topics = (await api<Idea[]>('/projects/hackathon/ideas')).body.filter((candidate) => candidate.kind === 'problem');
    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({ id: topic?.id, title: expect.stringContaining('dinner') });
    live.ws.close();
  });

  it('requires an explicit assignee to approve a risk suggestion', async () => {
    expect((await api('/projects/hackathon/suggestions/s3/approve', { method: 'POST', body: '{}' })).status).toBe(409);
    const ok = await api<Suggestion>('/projects/hackathon/suggestions/s3/approve', {
      method: 'POST',
      body: JSON.stringify({ assigneeId: 'morgan' }),
    });
    expect(ok.body.status).toBe('approved');
    const tasks = await api<Task[]>('/projects/hackathon/tasks');
    expect(tasks.body.find((t) => t.id === 't18')?.assigneeId).toBe('morgan');
  });

  it('answers project questions from approved decisions, with the decisions as sources', async () => {
    const hit = await api<MemoryAnswer>('/projects/hackathon/decisions/ask', {
      method: 'POST',
      body: JSON.stringify({ question: 'Where do we host the demo?' }),
    });
    expect(hit.status).toBe(200);
    expect(hit.body.found).toBe(true);
    expect(hit.body.ai.isMock).toBe(true);
    expect(hit.body.sources.every((d) => d.status === 'decided')).toBe(true);
    expect(hit.body.sources.map((d) => d.id)).toContain('d5');

    // The database question is still open, so memory must not invent an answer from the chat log.
    const miss = await api<MemoryAnswer>('/projects/hackathon/decisions/ask', {
      method: 'POST',
      body: JSON.stringify({ question: 'Which database did we pick?' }),
    });
    expect(miss.body.found).toBe(false);
    expect(miss.body.sources).toEqual([]);
  });

  it('records an open decision with its outcome, after which memory can answer from it', async () => {
    const approved = await api<Suggestion>('/projects/hackathon/suggestions/s2/approve', { method: 'POST', body: '{}' });
    expect(approved.body.status).toBe('approved');
    const decisions = await api<Decision[]>('/projects/hackathon/decisions');
    const open = decisions.body.find((d) => d.title === 'Which database to use');
    expect(open?.status).toBe('open');

    const decided = await api<Decision>(`/projects/hackathon/decisions/${open!.id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ outcome: 'SurrealDB, embedded', reason: 'Live queries fit our realtime chat' }),
    });
    expect(decided.body).toMatchObject({ status: 'decided', outcome: 'SurrealDB, embedded', decidedById: 'alex' });

    const answer = await api<MemoryAnswer>('/projects/hackathon/decisions/ask', {
      method: 'POST',
      body: JSON.stringify({ question: 'Which database did we pick?' }),
    });
    expect(answer.body.found).toBe(true);
    expect(answer.body.sources.map((d) => d.id)).toEqual([open!.id]);
  });

  it('converts an idea to a task once', async () => {
    const first = await api<{ task: Task }>('/projects/hackathon/ideas/i5/convert', { method: 'POST' });
    expect(first.status).toBe(201);
    expect(first.body.task.sourceKind).toBe('idea');
    expect((await api('/projects/hackathon/ideas/i5/convert', { method: 'POST' })).status).toBe(409);
  });
});
