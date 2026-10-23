import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as MeetingRepo from './repositories/meetings.js';
import type * as SuggestionRepo from './repositories/suggestions.js';
import type { Meeting, MeetingDetail, Suggestion } from '@project-room/shared';
vi.mock('./repositories/suggestions.js', async (orig) => {
  const mod = (await orig()) as typeof SuggestionRepo;
  return { ...mod, createSuggestion: vi.fn(mod.createSuggestion) };
});
vi.mock('./repositories/meetings.js', async (orig) => {
  const mod = (await orig()) as typeof MeetingRepo;
  return { ...mod, getMeeting: vi.fn(mod.getMeeting) };
});
import { createApp } from './app.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import type { MeetingAi, MeetingTickInput, SummarizeResult } from './ai/meeting.js';
import { startRealtime, type RealtimeHub } from './realtime/hub.js';
import { getDb } from './db/client.js';
import { rid } from './db/records.js';
import { beginSummarizing, getMeeting, restartSummarizing } from './repositories/meetings.js';
import { createSuggestion } from './repositories/suggestions.js';
import { runLiveTick } from './services/meeting-live.js';
import { resumeMeetings, summarize } from './services/meeting-summary.js';
import { endExpiredMeetings } from './services/meetings.js';

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

const P = 'hackathon';
const M = `/projects/${P}/meetings`;
const post = <T = Meeting>(path: string, member = 'alex', body: unknown = {}) =>
  api<T>(`${M}${path}`, { method: 'POST', member, body: JSON.stringify(body) });
const suggestions = async () => (await api<Suggestion[]>(`/projects/${P}/suggestions`)).body;

const result = (over: Partial<SummarizeResult> = {}): SummarizeResult => ({
  summary: { overview: 'We planned the demo.', decisions: ['Use React'], openQuestions: ['Which host?'], nextSteps: ['Ship it'] },
  actionItems: [{ title: 'Book the venue', assigneeId: 'jamie', priority: 'high', include: true, reason: 'r', quote: null }],
  carryOverItems: ['Which host?', 'Pick a logo'],
  usage: { inputTokens: 10, outputTokens: 5 },
  ...over,
});
const fakeAi = (summarizeMeeting: MeetingAi['summarizeMeeting'], onTick?: (i: MeetingTickInput) => void): MeetingAi => ({
  name: 'fake',
  isMock: false,
  async meetingTick(input) {
    onTick?.(input);
    return { actionItems: [], ideas: [], polls: [], runningSummary: 'rs', usage: { inputTokens: 0, outputTokens: 0 } };
  },
  summarizeMeeting,
});

/** Starts a meeting as alex, adds a line, and moves it to 'summarizing' as an end would. */
async function endedFlow(ai: MeetingAi, delays: number[] = [0, 0]) {
  const started = await post('');
  expect(started.status).toBe(201);
  const id = started.body.id;
  await post(`/${id}/lines`, 'alex', { text: 'We need to book the venue.' });
  await beginSummarizing(id);
  const meeting = await summarize(P, id, ai, delays);
  return { id, meeting };
}
const poll = async (id: string, done: (m: Meeting) => boolean) => {
  for (let i = 0; i < 100; i++) {
    const { body } = await api<MeetingDetail>(`${M}/${id}`);
    if (done(body.meeting)) return body.meeting;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('Timed out');
};

describe('meeting summary', () => {
  let firstId: string;

  it('ending a meeting stores the summary and creates suggestions', async () => {
    const { id, meeting } = await endedFlow(fakeAi(async () => result()));
    firstId = id;
    expect(meeting).toMatchObject({ status: 'ended', summaryError: null, usage: { calls: 1, inputTokens: 10, outputTokens: 5 } });
    expect(meeting.summary?.overview).toBe('We planned the demo.');
    expect(meeting.endedAt).toBeTruthy();
    const mine = (await suggestions()).filter((s) => s.meetingId === id);
    expect(mine.map((s) => s.kind).sort()).toEqual(['action_items', 'meeting_notes']);
    expect(mine.find((s) => s.kind === 'action_items')).toMatchObject({
      title: '1 action item from the meeting summary',
      status: 'pending',
    });
    const notes = mine.find((s) => s.kind === 'meeting_notes')!;
    expect(notes.title).toBe('Notes for next meeting');
    expect(notes.items.map((i) => [i.title, i.include, i.assigneeId])).toEqual([
      ['Which host?', true, null],
      ['Pick a logo', true, null],
    ]);
  });

  it('only participants can end; /end returns summarizing and then the summary lands', async () => {
    const started = await post('');
    const id = started.body.id;
    expect((await post(`/${id}/end`, 'taylor')).status).toBe(403);
    const ended = await post(`/${id}/end`, 'alex');
    expect(ended.body).toMatchObject({ status: 'summarizing', participantIds: [] });
    const done = await poll(id, (m) => m.status === 'ended');
    expect(done.summary).not.toBeNull();
    expect((await post(`/${id}/end`, 'alex')).status).toBe(409);
  });

  it('retries, then records summaryError; ending again reruns only the summary', async () => {
    let calls = 0;
    const { id, meeting } = await endedFlow(
      fakeAi(async () => {
        calls++;
        throw new Error('boom');
      }),
    );
    expect(calls).toBe(3);
    expect(meeting).toMatchObject({ status: 'ended', summary: null, summaryError: 'boom' });
    const again = await post(`/${id}/end`, 'jamie');
    expect(again.body.status).toBe('summarizing');
    const fixed = await poll(id, (m) => m.status === 'ended');
    expect(fixed.summaryError).toBeNull();
    expect(fixed.summary).not.toBeNull();
  });

  it('approving notes sets carryOver and the next meeting links to it', async () => {
    const notes = (await suggestions()).find((s) => s.meetingId === firstId && s.kind === 'meeting_notes')!;
    await api(`/projects/${P}/suggestions/${notes.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ items: notes.items.map((i, n) => ({ ...i, include: n === 0 })) }),
    });
    const approved = await api<Suggestion>(`/projects/${P}/suggestions/${notes.id}/approve`, { method: 'POST', body: '{}' });
    expect(approved.body.status).toBe('approved');
    expect((await getMeeting(P, firstId)).carryOver).toEqual(['Which host?']);

    const next = await post('');
    expect(next.body.previousMeetingId).toBe(firstId);

    let seen: string[] = [];
    await post(`/${next.body.id}/lines`, 'alex', { text: 'hello there' });
    await runLiveTick(
      P,
      next.body.id,
      fakeAi(
        async () => result(),
        (i) => (seen = i.carryOver),
      ),
    );
    expect(seen).toEqual(['Which host?']);
    await post(`/${next.body.id}/end`, 'alex');
    await poll(next.body.id, (m) => m.status === 'ended');
  });

  it('resumes expired and summarizing meetings after a restart', async () => {
    const a = (await post('')).body.id;
    // a is live and past endsAt; sweeping it with a later clock mimics a restart after the cap.
    await endExpiredMeetings(
      new Date(Date.now() + 61 * 60_000),
      fakeAi(async () => result({ actionItems: [], carryOverItems: [] })),
    );
    expect((await getMeeting(P, a)).status).toBe('ended');
    expect((await getMeeting(P, a)).summary?.overview).toBe('We planned the demo.');

    const c = (await post('')).body.id;
    await beginSummarizing(c);
    expect((await getMeeting(P, c)).status).toBe('summarizing');
    await resumeMeetings();
    expect(await getMeeting(P, c)).toMatchObject({ status: 'ended', summaryError: null });
    expect((await getMeeting(P, c)).summary).not.toBeNull();
  });

  it('a failed suggestion write leaves summaryError, and the rerun creates each suggestion once', async () => {
    const actual = await vi.importActual<typeof SuggestionRepo>('./repositories/suggestions.js');
    vi.mocked(createSuggestion).mockImplementationOnce(actual.createSuggestion).mockRejectedValueOnce(new Error('db down'));
    const { id, meeting } = await endedFlow(fakeAi(async () => result()));
    expect(meeting).toMatchObject({ status: 'ended', summary: null });
    expect(meeting.summaryError).toContain('db down');
    expect((await suggestions()).filter((s) => s.meetingId === id).map((s) => s.kind)).toEqual(['action_items']);

    await restartSummarizing(id);
    const fixed = await summarize(
      P,
      id,
      fakeAi(async () => result()),
    );
    expect(fixed).toMatchObject({ status: 'ended', summaryError: null });
    expect(fixed.summary).not.toBeNull();
    const kinds = (await suggestions()).filter((s) => s.meetingId === id).map((s) => s.kind);
    expect(kinds.sort()).toEqual(['action_items', 'meeting_notes']);
  });

  it('two simultaneous starts create one live meeting; ending it frees the project', async () => {
    const [a, b] = await Promise.all([post(''), post('', 'jamie')]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const winner = a.status === 201 ? a.body : b.body;
    const ai = fakeAi(async () => result());
    await beginSummarizing(winner.id);
    await summarize(P, winner.id, ai);
    const next = await post('');
    expect(next.status).toBe(201);
    await beginSummarizing(next.body.id);
    await summarize(P, next.body.id, ai);
  });

  it('ends with summaryError when setup fails, so /end can rerun it', async () => {
    const id = (await post('')).body.id;
    await getDb().query('UPDATE $id SET previousMeetingId = $prev', { id: rid('meeting', id), prev: rid('meeting', 'missing') });
    await beginSummarizing(id);
    const meeting = await summarize(
      P,
      id,
      fakeAi(async () => result()),
      [0, 0],
    );
    expect(meeting).toMatchObject({ status: 'ended', summary: null });
    expect(meeting.summaryError).toBeTruthy();
  });

  it('resumeMeetings carries on past a meeting whose summary throws', async () => {
    const a = (await post('')).body.id;
    await beginSummarizing(a);
    vi.mocked(getMeeting).mockRejectedValueOnce(new Error('poisoned'));
    await expect(resumeMeetings()).resolves.toBeUndefined();
    expect((await getMeeting(P, a)).status).toBe('summarizing');
    await resumeMeetings();
    expect((await getMeeting(P, a)).status).toBe('ended');
  });
});
