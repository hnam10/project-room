import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { Meeting, MeetingDetail, ServerMessage, TranscriptLine } from '@project-room/shared';
import { createApp } from './app.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { addProjectMember, ensureProject } from './repositories/projects.js';
import { dropFromLiveMeeting, endExpiredMeetings } from './services/meetings.js';
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

const M = '/projects/hackathon/meetings';
const post = (path: string, member: string, body: unknown = {}) =>
  api<Meeting & TranscriptLine>(`${M}${path}`, { method: 'POST', member, body: JSON.stringify(body) });

describe('meetings API', () => {
  let id: string;

  it('allows one live meeting per project', async () => {
    const first = await post('', 'alex', { title: 'Kickoff' });
    expect(first.status).toBe(201);
    id = first.body.id;
    expect(first.body).toMatchObject({
      status: 'live',
      participantIds: ['alex'],
      attendeeIds: ['alex'],
      aiEnabled: true,
      previousMeetingId: null,
    });
    expect((await post('', 'jamie')).status).toBe(409);
  });

  it('join is idempotent and leave removes the member', async () => {
    await post(`/${id}/join`, 'jamie');
    const joined = await post(`/${id}/join`, 'jamie');
    expect((joined.body as Meeting).participantIds.filter((m) => m === 'jamie')).toHaveLength(1);
    const left = await post(`/${id}/leave`, 'jamie');
    expect((left.body as Meeting).participantIds).toEqual(['alex']);
    expect((left.body as Meeting).attendeeIds).toContain('jamie');
    await post(`/${id}/join`, 'jamie');
  });

  it('reports browser transcription and refuses audio clips when GROQ_API_KEY is unset', async () => {
    const rtc = await api<{ transcription: string }>(`${M}/rtc-config`);
    expect(rtc.body.transcription).toBe('browser');
    const res = await fetch(`${base}/api${M}/${id}/audio`, {
      method: 'POST',
      headers: { 'content-type': 'audio/webm', 'x-member-id': 'jamie' },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(res.status).toBe(501);
  });

  it('only participants post lines; lines are capped at 1000 chars', async () => {
    expect((await post(`/${id}/lines`, 'taylor', { text: 'hi' })).status).toBe(403);
    const ok = await post(`/${id}/lines`, 'jamie', { text: 'hello', speakerId: 'alex' });
    expect(ok.status).toBe(201);
    expect((ok.body as TranscriptLine).speakerId).toBe('jamie');
    expect((await post(`/${id}/lines`, 'jamie', { text: 'x'.repeat(1001) })).status).toBe(400);
    const detail = await api<MeetingDetail>(`${M}/${id}`);
    expect(detail.body.lines.map((l) => l.text)).toEqual(['hello']);
    expect(detail.body.polls).toEqual([]);
    const list = await api<Meeting[]>(M);
    expect(list.body.map((m) => m.id)).toContain(id);
  });

  it('broadcasts transcript lines over realtime', async () => {
    const { ws, ready, waitFor } = listen('hackathon');
    await ready;
    await post(`/${id}/lines`, 'alex', { text: 'live line' });
    await waitFor((e) => e.type === 'change' && e.table === 'transcript_line');
    ws.close();
  });

  it('keeps other projects out', async () => {
    await ensureProject({ id: 'other', name: 'Other' });
    await addProjectMember('other', 'stranger');
    expect((await api(`${M}/${id}`, { member: 'stranger' })).status).toBe(403);
  });

  it('rejects lines after the meeting ends or expires', async () => {
    await endExpiredMeetings(new Date(Date.now() + 61 * 60_000));
    const detail = await api<MeetingDetail>(`${M}/${id}`);
    expect(detail.body.meeting.status).toBe('ended');
    expect((await post(`/${id}/lines`, 'alex', { text: 'late' })).status).toBe(409);
  });

  it('ends a meeting on request', async () => {
    const started = await post('', 'alex');
    expect(started.status).toBe(201);
    const ended = await post(`/${started.body.id}/end`, 'alex');
    expect(ended.body).toMatchObject({ status: 'summarizing', participantIds: [] });
    expect(ended.body.endedAt).toBeTruthy();
  });

  it('ends the meeting when the last participant leaves', async () => {
    const { body } = await post('', 'alex');
    await post(`/${body.id}/join`, 'jamie');
    expect((await post(`/${body.id}/leave`, 'jamie')).body).toMatchObject({ status: 'live', participantIds: ['alex'] });
    expect((await post(`/${body.id}/leave`, 'alex')).body).toMatchObject({ status: 'summarizing', participantIds: [] });
  });

  it('a dropped last participant ends the meeting after the grace period unless someone rejoins', async () => {
    const { body } = await post('', 'alex');
    const dropping = dropFromLiveMeeting('hackathon', 'alex', 300);
    await new Promise((resolve) => setTimeout(resolve, 100)); // removed, still in the grace period
    await post(`/${body.id}/join`, 'alex'); // a refresh rejoins
    await dropping;
    expect((await api<MeetingDetail>(`${M}/${body.id}`)).body.meeting.status).toBe('live');
    await dropFromLiveMeeting('hackathon', 'alex', 0);
    expect((await api<MeetingDetail>(`${M}/${body.id}`)).body.meeting.status).not.toBe('live');
  });
});
