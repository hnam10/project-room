import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Meeting, TranscriptLine } from '@project-room/shared';
import type { MeetingAi, MeetingTickInput, MeetingTickResult } from './ai/meeting.js';
import { createApp } from './app.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { getMeeting } from './repositories/meetings.js';
import { listSuggestions } from './repositories/suggestions.js';
import { listIdeas } from './repositories/ideas.js';
import { startRealtime, type RealtimeHub } from './realtime/hub.js';
import { shouldRun } from './services/meeting-trigger.js';
import { checkMeeting, noteLine, runLiveTick, triggerState } from './services/meeting-live.js';

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
  const res = await fetch(`${base}/api/projects/hackathon${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-member-id': init.member ?? 'alex' },
  });
  return { status: res.status, body: (await res.json()) as T };
};
const post = <T>(path: string, body: unknown = {}, member = 'alex') => api<T>(path, { method: 'POST', member, body: JSON.stringify(body) });

const empty: MeetingTickResult = { actionItems: [], ideas: [], polls: [], runningSummary: '', usage: { inputTokens: 0, outputTokens: 0 } };
function fakeAi(make: (input: MeetingTickInput) => Partial<MeetingTickResult> | Error) {
  const inputs: MeetingTickInput[] = [];
  const ai: MeetingAi = {
    name: 'fake',
    isMock: true,
    async meetingTick(input) {
      inputs.push(input);
      const out = make(input);
      if (out instanceof Error) throw out;
      return { ...empty, ...out };
    },
    async summarizeMeeting() {
      throw new Error('not used');
    },
  };
  return { ai, inputs };
}

describe('live meeting pipeline', () => {
  let meetingId: string;
  const speak = async (text: string) => (await post<TranscriptLine>(`/meetings/${meetingId}/lines`, { text })).body;

  beforeAll(async () => {
    meetingId = (await post<Meeting>('/meetings', { title: 'Live' })).body.id;
  });

  it('stores suggestions with meetingId, cite and moves the cursor', async () => {
    const l1 = await speak('Jamie will build the login page by Friday');
    const l2 = await speak('Maybe we should poll on the name');
    const { ai } = fakeAi(() => ({
      actionItems: [
        {
          title: 'Build login page',
          assigneeId: 'jamie',
          priority: 'high',
          include: true,
          reason: 'said so',
          quote: 'build the login page',
          sourceLineId: l1.id,
        },
      ],
      polls: [{ draft: { question: 'Which name?', options: ['A', 'B'] }, reason: 'asked', quote: null, sourceLineId: l2.id }],
      runningSummary: 'Login page discussed.',
      usage: { inputTokens: 10, outputTokens: 5 },
    }));
    const created = await runLiveTick('hackathon', meetingId, ai);
    expect(created.map((s) => s.kind).sort()).toEqual(['action_items', 'poll']);
    const action = created.find((s) => s.kind === 'action_items')!;
    expect(action.title).toBe('1 action item from the meeting');
    expect(action.meetingId).toBe(meetingId);
    expect(action.sourceLineId).toBe(l1.id);
    expect(action.cite).toMatch(/^.+ · Meeting · \d\d:\d\d$/);
    expect(created.find((s) => s.kind === 'poll')!.title).toBe('Poll: Which name?');
    const meeting = await getMeeting('hackathon', meetingId);
    expect(meeting.aiCursor).toBe(l2.id);
    expect(meeting.runningSummary).toBe('Login page discussed.');
    expect(meeting.usage).toEqual({ calls: 1, inputTokens: 10, outputTokens: 5 });
    expect((await listSuggestions('hackathon')).filter((s) => s.meetingId === meetingId)).toHaveLength(2);
  });

  it('does not re-read lines before the cursor and skips the AI with no new lines', async () => {
    const quiet = fakeAi(() => ({}));
    expect(await runLiveTick('hackathon', meetingId, quiet.ai)).toEqual([]);
    expect(quiet.inputs).toHaveLength(0);
    const l3 = await speak('Third line');
    const { ai, inputs } = fakeAi(() => ({}));
    await runLiveTick('hackathon', meetingId, ai);
    expect(inputs[0]!.lines.map((l) => l.id)).toEqual([l3.id]);
    expect(inputs[0]!.lines[0]!.speakerName).toBe('Alex');
    expect(inputs[0]!.alreadySuggested).toContain('Poll: Which name?');
    expect((await getMeeting('hackathon', meetingId)).usage.calls).toBe(2);
  });

  it('swallows provider errors and leaves the meeting unchanged', async () => {
    await speak('Another line');
    const before = await getMeeting('hackathon', meetingId);
    const { ai } = fakeAi(() => new Error('boom'));
    expect(await runLiveTick('hackathon', meetingId, ai)).toEqual([]);
    expect(await getMeeting('hackathon', meetingId)).toEqual(before);
  });

  it('checkMeeting runs a tick once the thresholds are met', async () => {
    const meeting = await getMeeting('hackathon', meetingId);
    noteLine(meeting, Array(80).fill('word').join(' '), 1_000);
    const { ai, inputs } = fakeAi(() => ({}));
    await checkMeeting(meetingId, 1_000, ai);
    expect(inputs).toHaveLength(1);
    await checkMeeting(meetingId, 2_000, ai); // newWords reset, nothing new
    expect(inputs).toHaveLength(1);
  });

  it('keeps words noted while a tick is in flight', async () => {
    const meeting = await getMeeting('hackathon', meetingId);
    noteLine(meeting, Array(80).fill('word').join(' '), 1_000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { ai } = fakeAi(() => ({}));
    const slow: MeetingAi = { ...ai, meetingTick: async (input) => (await gate, ai.meetingTick(input)) };
    await speak('Line for the slow tick');
    const running = checkMeeting(meetingId, 50_000, slow);
    noteLine(meeting, Array(40).fill('word').join(' '), 5_000);
    release();
    await running;
    const state = triggerState(meetingId)!;
    expect(state.newWords).toBe(40);
    expect(shouldRun(state, 25_000)).toBe(true);
  });

  it('keeps meeting ideas pending while a reviewable topic is chosen', async () => {
    const line = await speak('How should we help students find study groups?');
    const { ai } = fakeAi(() => ({
      topic: {
        title: 'How should students find study groups?',
        description: 'Help students connect with suitable groups.',
        reason: 'The team framed a problem to brainstorm.',
        quote: line.text,
        sourceLineId: line.id,
      },
      ideas: [
        {
          ideaId: null,
          draft: { title: 'Match by course', description: 'Show groups taking the same course.', theme: 'Option' },
          reason: 'One way to address the problem.',
          quote: line.text,
          sourceLineId: line.id,
        },
      ],
    }));
    const created = await runLiveTick('hackathon', meetingId, ai);
    const topic = created.find((s) => s.kind === 'brainstorm_topic')!;
    const idea = created.find((s) => s.kind === 'idea')!;
    expect(topic).toMatchObject({
      status: 'pending',
      meetingId,
      sourceLineId: line.id,
      ideaDraft: { title: 'How should students find study groups?' },
    });
    expect(idea.status).toBe('pending');
    expect((await listIdeas('hackathon')).filter((item) => item.kind === 'problem')).toHaveLength(0);

    await speak('We can keep exploring study group options.');
    expect((await runLiveTick('hackathon', meetingId, ai)).some((s) => s.kind === 'brainstorm_topic')).toBe(false);
    const approved = await post(`/suggestions/${topic.id}/approve`);
    expect(approved.status).toBe(200);
    expect((await listIdeas('hackathon')).find((item) => item.kind === 'problem')?.title).toBe('How should students find study groups?');
    expect((await listSuggestions('hackathon')).find((s) => s.id === idea.id)?.status).toBe('pending');

    await speak('Could the topic instead be mentoring?');
    const revised = fakeAi(() => ({
      topic: {
        title: 'How should we organize mentoring?',
        description: '',
        reason: 'The team changed direction.',
        quote: null,
        sourceLineId: null,
      },
    }));
    expect((await runLiveTick('hackathon', meetingId, revised.ai)).some((s) => s.kind === 'brainstorm_topic')).toBe(false);
  });

  it('POST /ai {enabled:false} stops ticks; only participants may toggle', async () => {
    expect((await post(`/meetings/${meetingId}/ai`, { enabled: false }, 'jamie')).status).toBe(403);
    const off = await post<Meeting>(`/meetings/${meetingId}/ai`, { enabled: false });
    expect(off.body.aiEnabled).toBe(false);
    await speak('Silent now');
    const { ai, inputs } = fakeAi(() => ({}));
    expect(await runLiveTick('hackathon', meetingId, ai)).toEqual([]);
    expect(inputs).toHaveLength(0);
  });
});
