import { mkdir, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  MAX_FILE_BYTES,
  type Idea,
  type Message,
  type Project,
  type ProjectFile,
  type ServerMessage,
  type Suggestion,
  type Task,
  type WorkspaceSnapshot,
} from '@project-room/shared';
import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { startRealtime, type RealtimeHub } from './realtime/hub.js';
import { createFile } from './repositories/files.js';
import { readStoredFile, removeStoredFile, storedFilePath, writeStoredFile } from './services/file-store.js';

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
  await rm(config.filesDir, { recursive: true, force: true });
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
    expect(body.files).toEqual([]);
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
    expect(
      (await api<Idea[]>('/projects/hackathon/ideas')).body.some((candidate) => candidate.sourceSuggestionId === topicSuggestion?.id),
    ).toBe(false);
    await api(`/projects/hackathon/suggestions/${topicSuggestion!.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ideaDraft: { ...topicSuggestion!.ideaDraft, description: 'Focus on campus dining surplus.' } }),
    });
    expect(
      (await api<Suggestion>(`/projects/hackathon/suggestions/${topicSuggestion!.id}/approve`, { method: 'POST', body: '{}' })).body.status,
    ).toBe('approved');
    const topic = (await api<Idea[]>('/projects/hackathon/ideas')).body.find(
      (candidate) => candidate.sourceSuggestionId === topicSuggestion?.id,
    );
    expect(topic).toMatchObject({ description: 'Focus on campus dining surplus.' });

    const before = await api<Idea[]>('/projects/hackathon/ideas');
    expect(before.body.some((idea) => idea.title === suggestion.ideaDraft?.title)).toBe(false);

    const approved = await api<Suggestion>(`/projects/hackathon/suggestions/${suggestion.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ topicId: topic!.id }),
    });
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
    expect(updatedTopic.record.ideaId).toBeNull();
    await api(`/projects/hackathon/suggestions/${updatedTopic.record.id}/approve`, { method: 'POST', body: '{}' });
    const topics = (await api<Idea[]>('/projects/hackathon/ideas')).body.filter((candidate) => candidate.kind === 'problem');
    expect(topics).toHaveLength(3);
    expect(topics.some((item) => item.title.includes('dinner'))).toBe(true);
    expect(topics.some((item) => item.id === topic?.id && item.description === 'Focus on campus dining surplus.')).toBe(true);
    live.ws.close();
  });

  it('does not repeat suggestions already waiting when @AI is asked again', async () => {
    const live = listen('hackathon');
    await live.ready;

    await api('/projects/hackathon/channels/hackathon-general/messages', {
      method: 'POST',
      body: JSON.stringify({ text: '@AI where do we host the demo?' }),
    });

    const reply = (await live.waitFor(
      (e) =>
        e.type === 'change' &&
        e.table === 'message' &&
        e.action === 'create' &&
        e.record.authorId === 'ai' &&
        e.record.text.includes('Mock AI'),
    )) as Extract<ServerMessage, { table: 'message' }>;
    expect(reply.record.suggestionId).toBeNull();

    const suggestions = await api<Suggestion[]>('/projects/hackathon/suggestions');
    const pendingTitles = suggestions.body
      .filter((suggestion) => suggestion.kind === 'action_items' && suggestion.status === 'pending')
      .flatMap((suggestion) => suggestion.items.map((item) => item.title));
    expect(pendingTitles).toEqual(['Implement password reset flow', 'Design onboarding screens in Figma', 'Decide which database to use']);
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

  it('converts an idea to a task once', async () => {
    const first = await api<{ task: Task }>('/projects/hackathon/ideas/i5/convert', { method: 'POST' });
    expect(first.status).toBe(201);
    expect(first.body.task.sourceKind).toBe('idea');
    expect((await api('/projects/hackathon/ideas/i5/convert', { method: 'POST' })).status).toBe(409);
  });

  it('uploads a project file, shares it with members, and deletes it', async () => {
    const live = listen('hackathon');
    await live.ready;

    const notes = Buffer.from('demo notes');
    const created = await uploadFile('계획.txt', notes, { type: 'text/plain' });
    expect(created.status).toBe(201);
    const file = created.body as ProjectFile;
    expect(file.name).toBe('계획.txt');
    expect(file.size).toBe(notes.length);
    expect(file.uploadedById).toBe('alex');
    expect(file).not.toHaveProperty('bytes');

    await live.waitFor((e) => e.type === 'change' && e.table === 'file' && e.action === 'create' && e.record.id === file.id);

    const listed = await api<ProjectFile[]>('/projects/hackathon/files');
    expect(listed.body.map((item) => item.id)).toContain(file.id);

    const sneaky = await uploadFile('../../etc/passwd', Buffer.from('nope'));
    expect(sneaky.status).toBe(201);
    expect((sneaky.body as ProjectFile).name).toBe('passwd');

    const download = await fetch(`${base}/api/projects/hackathon/files/${file.id}/download`, { headers: { 'x-member-id': 'jamie' } });
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toContain('text/plain');
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(download.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await download.arrayBuffer()).equals(notes)).toBe(true);

    expect((await uploadFile('..', Buffer.from('x'))).status).toBe(400);
    expect((await uploadFile('empty.txt', Buffer.alloc(0))).status).toBe(400);
    expect((await uploadFile('big.bin', Buffer.alloc(MAX_FILE_BYTES + 1))).status).toBe(413);
    expect((await uploadFile('secret.txt', Buffer.from('no'), { member: 'stranger' })).status).toBe(403);

    expect((await api(`/projects/hackathon/files/${file.id}`, { method: 'DELETE' })).status).toBe(204);
    await live.waitFor((e) => e.type === 'change' && e.table === 'file' && e.action === 'delete' && e.record.id === file.id);
    const gone = await fetch(`${base}/api/projects/hackathon/files/${file.id}/download`, { headers: { 'x-member-id': 'alex' } });
    expect(gone.status).toBe(404);
    live.ws.close();
  });

  it('posts an uploaded file into the channel and rejects a file from outside the project', async () => {
    const created = await uploadFile('notes.txt', Buffer.from('hello'));
    expect(created.status).toBe(201);
    const file = created.body as ProjectFile;

    const posted = await api<Message>('/projects/hackathon/channels/hackathon-general/messages', {
      method: 'POST',
      body: JSON.stringify({ text: file.name, fileId: file.id }),
    });
    expect(posted.status).toBe(201);
    expect(posted.body.fileId).toBe(file.id);
    expect((await api<ProjectFile[]>('/projects/hackathon/files')).body.map((item) => item.id)).toContain(file.id);

    const missing = await api('/projects/hackathon/channels/hackathon-general/messages', {
      method: 'POST',
      body: JSON.stringify({ text: 'missing', fileId: 'missing-file' }),
    });
    expect(missing.status).toBe(404);

    await createFile('other', 'alex', { id: 'other-chat-file', name: 'private.txt', size: 1, contentType: 'text/plain' });
    const foreign = await api('/projects/hackathon/channels/hackathon-general/messages', {
      method: 'POST',
      body: JSON.stringify({ text: 'private.txt', fileId: 'other-chat-file' }),
    });
    expect(foreign.status).toBe(404);
  });

  it('keeps the file listed after disk removal fails and allows a DELETE retry', async () => {
    const bytes = Buffer.from('retry me');
    const created = await uploadFile('retry.txt', bytes);
    expect(created.status).toBe(201);
    const file = created.body as ProjectFile;
    const stored = storedFilePath('hackathon', file.id);
    // A directory at the file path makes removal fail without depending on OS permissions.
    await removeStoredFile('hackathon', file.id);
    await mkdir(stored);

    expect((await api(`/projects/hackathon/files/${file.id}`, { method: 'DELETE' })).status).toBe(500);
    expect((await api<ProjectFile[]>('/projects/hackathon/files')).body).toContainEqual(file);

    await rm(stored, { recursive: true });
    await writeStoredFile('hackathon', file.id, bytes);
    expect((await api(`/projects/hackathon/files/${file.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api<ProjectFile[]>('/projects/hackathon/files')).body).not.toContainEqual(file);
    expect(await readStoredFile('hackathon', file.id)).toBeNull();
  });

  it('deletes metadata even when the stored bytes are already missing', async () => {
    const created = await uploadFile('missing.txt', Buffer.from('gone'));
    expect(created.status).toBe(201);
    const file = created.body as ProjectFile;
    await removeStoredFile('hackathon', file.id);

    expect((await api(`/projects/hackathon/files/${file.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api<ProjectFile[]>('/projects/hackathon/files')).body).not.toContainEqual(file);
  });

  it('checks file ownership before touching stored bytes', async () => {
    const file = await createFile('other', 'alex', { id: 'other-file', name: 'private.txt', size: 1, contentType: 'text/plain' });
    const bytes = Buffer.from('keep');
    await writeStoredFile('hackathon', file.id, bytes);

    expect((await api(`/projects/hackathon/files/${file.id}`, { method: 'DELETE' })).status).toBe(404);
    expect(await readStoredFile('hackathon', file.id)).toEqual(bytes);
  });
});

async function uploadFile(name: string, bytes: Buffer, options: { member?: string; type?: string } = {}) {
  const res = await fetch(`${base}/api/projects/hackathon/files`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(name),
      'x-file-type': options.type ?? 'application/octet-stream',
      'x-member-id': options.member ?? 'alex',
    },
    body: bytes,
  });
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as ProjectFile | { error: string } };
}
