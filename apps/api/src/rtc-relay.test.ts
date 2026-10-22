import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { Meeting, ServerMessage } from '@project-room/shared';
import { createApp } from './app.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { addProjectMember, ensureProject } from './repositories/projects.js';
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

const api = async <T>(path: string, member = 'alex', method = 'GET') => {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-member-id': member },
    body: method === 'POST' ? '{}' : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
};

async function client(member: string, projectId = 'hackathon') {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?member=${member}`);
  const rtc: ServerMessage[] = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw)) as ServerMessage;
    if (msg.type === 'rtc') rtc.push(msg);
  });
  await new Promise<void>((resolve) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'subscribe', projectId })));
    ws.on('message', (raw) => JSON.parse(String(raw)).type === 'ready' && resolve());
  });
  return { ws, rtc };
}

const signal = { kind: 'offer', data: { sdp: 'x' } };
const pause = () => new Promise((r) => setTimeout(r, 300));
const M = '/projects/hackathon/meetings';

describe('rtc relay', () => {
  it('serves ICE servers', async () => {
    const { status, body } = await api<{ iceServers: { urls: string }[] }>(`${M}/rtc-config`);
    expect(status).toBe(200);
    expect(body.iceServers[0].urls).toContain('stun:');
  });

  it('relays signals between participants only, and stops when the meeting ends', async () => {
    const meeting = (await api<Meeting>(M, 'alex', 'POST')).body;
    await api(`${M}/${meeting.id}/join`, 'jamie', 'POST');
    const alex = await client('alex');
    const jamie = await client('jamie');
    const taylor = await client('taylor');
    const send = (c: typeof alex, to: string, meetingId = meeting.id) => c.ws.send(JSON.stringify({ type: 'rtc', meetingId, to, signal }));

    send(alex, 'jamie');
    await pause();
    expect(jamie.rtc).toEqual([{ type: 'rtc', meetingId: meeting.id, from: 'alex', signal }]);

    send(alex, 'taylor'); // recipient not in the call
    send(taylor, 'alex'); // sender not in the call
    alex.ws.send(JSON.stringify({ type: 'rtc', meetingId: meeting.id, to: 'jamie', signal: { kind: 'bogus' } }));
    await pause();
    expect(taylor.rtc).toHaveLength(0);
    expect(alex.rtc).toHaveLength(0);
    expect(jamie.rtc).toHaveLength(1);

    await api('/projects/hackathon/meetings/' + meeting.id + '/end', 'alex', 'POST');
    send(alex, 'jamie');
    await pause();
    expect(jamie.rtc).toHaveLength(1);
    for (const c of [alex, jamie, taylor]) c.ws.close();
  });

  it('drops signals naming a meeting of another project', async () => {
    await ensureProject({ id: 'other', name: 'Other' });
    await addProjectMember('other', 'stranger');
    await addProjectMember('other', 'alex');
    const foreign = (await api<Meeting>('/projects/other/meetings', 'stranger', 'POST')).body;
    await api(`/projects/other/meetings/${foreign.id}/join`, 'alex', 'POST');
    const alex = await client('alex');
    const stranger = await client('stranger', 'other');
    alex.ws.send(JSON.stringify({ type: 'rtc', meetingId: foreign.id, to: 'stranger', signal }));
    await pause();
    expect(stranger.rtc).toHaveLength(0);
    alex.ws.close();
    stranger.ws.close();
  });
});

describe('dropped members', () => {
  const participants = async (id: string) => (await api<{ meeting: Meeting }>(`${M}/${id}`)).body.meeting.participantIds;
  const waitFor = async (id: string, expected: string[]) => {
    for (let i = 0; i < 20 && (await participants(id)).sort().join() !== expected.join(); i++) await new Promise((r) => setTimeout(r, 100));
    return (await participants(id)).sort();
  };

  it('removes a participant when their last socket closes', async () => {
    const meeting = (await api<Meeting>(M, 'alex', 'POST')).body;
    await api(`${M}/${meeting.id}/join`, 'jamie', 'POST');
    const alex = await client('alex');
    const jamie1 = await client('jamie');
    const jamie2 = await client('jamie');

    jamie1.ws.close();
    await pause();
    expect((await participants(meeting.id)).sort()).toEqual(['alex', 'jamie']); // still connected on the other socket

    jamie2.ws.close();
    expect(await waitFor(meeting.id, ['alex'])).toEqual(['alex']);
    alex.ws.close();
    await api(`${M}/${meeting.id}/end`, 'alex', 'POST');
  });
});

describe('malformed frames', () => {
  it('ignores null and non-JSON frames and closes on oversized ones, and the server stays up', async () => {
    const { ws } = await client('alex');
    ws.send('null');
    ws.send('not json');
    ws.send('"text"');
    await pause();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    const closed = new Promise<number>((resolve) => ws.on('close', resolve));
    ws.send('x'.repeat(70 * 1024));
    expect(await closed).toBe(1009);
    expect((await api('/projects/hackathon/meetings')).status).toBe(200);
  });
});
