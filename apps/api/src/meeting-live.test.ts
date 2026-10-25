import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Idea, Meeting, ProjectFile, TranscriptLine } from '@project-room/shared';
import type { MeetingAi, MeetingTickInput, MeetingTickResult } from './ai/meeting.js';
import { createApp } from './app.js';
import { closeDb, connectDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { setMemoryDocumentId } from './repositories/files.js';
import { getMeeting } from './repositories/meetings.js';
import { listSuggestions } from './repositories/suggestions.js';
import { listIdeas } from './repositories/ideas.js';
import { startRealtime, type RealtimeHub } from './realtime/hub.js';
import { shouldRun } from './services/meeting-trigger.js';
import { proposeMeetingTopic } from './services/meeting-topic.js';
import type { AiProvider, FileExcerpt } from './ai/provider.js';
import { answerMeetingMention, checkMeeting, noteLine, runLiveTick, triggerState } from './services/meeting-live.js';
import type { ProjectMemory } from './services/project-memory.js';

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
  it('rechecks every saved topic before storing a new proposal', async () => {
    const first = (await post<Idea>('/ideas', { kind: 'problem', title: 'Dinner menu', description: '', theme: 'Option' })).body;
    const second = (await post<Idea>('/ideas', { kind: 'problem', title: 'Fix audio issues', description: '', theme: 'Option' })).body;
    for (const proposed of [
      { title: 'FIX AUDIO ISSUES!', existingTopicId: null },
      { title: 'Resolve sound playback problems', existingTopicId: second.id },
    ]) {
      expect(
        await proposeMeetingTopic(
          'hackathon',
          meetingId,
          {
            ...proposed,
            description: '',
            reason: 'r',
            quote: null,
            sourceLineId: null,
          },
          first,
          [],
          null,
        ),
      ).toBeNull();
    }
  });
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

  it('a short chat line is enough for a run after a 2s pause; short speech is not', async () => {
    const meeting = await getMeeting('hackathon', meetingId);
    const { ai } = fakeAi(() => ({}));
    await checkMeeting(meetingId, 1_000_000, ai); // flush words noted by earlier tests
    noteLine(meeting, 'Jamie will build it', 2_000_000);
    expect(shouldRun(triggerState(meetingId)!, 2_010_000)).toBe(false);
    noteLine(meeting, 'Jamie will build it', 2_000_000, true);
    expect(shouldRun(triggerState(meetingId)!, 2_001_000)).toBe(false);
    expect(shouldRun(triggerState(meetingId)!, 2_002_000)).toBe(true);
    await checkMeeting(meetingId, 2_010_000, ai); // leave no pending words for the next test
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

  it('scopes meeting ideas to an existing topic while new topics remain separate', async () => {
    const existingTopic = (await post<Idea>('/ideas', { kind: 'problem', title: 'Study group matching', description: '', theme: 'Option' }))
      .body;
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
          topicId: existingTopic.id,
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
    expect(idea.topicId).toBe(existingTopic.id);
    expect((await listIdeas('hackathon')).some((item) => item.sourceSuggestionId === topic.id)).toBe(false);

    await speak('We can keep exploring study group options.');
    expect((await runLiveTick('hackathon', meetingId, ai)).some((s) => s.kind === 'brainstorm_topic')).toBe(false);
    const approved = await post(`/suggestions/${topic.id}/approve`);
    expect(approved.status).toBe(200);
    expect((await listIdeas('hackathon')).find((item) => item.sourceSuggestionId === topic.id)?.title).toBe(
      'How should students find study groups?',
    );
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
    const previousTopics = (await listIdeas('hackathon')).filter((item) => item.kind === 'problem');
    const nextTopic = (await runLiveTick('hackathon', meetingId, revised.ai)).find((s) => s.kind === 'brainstorm_topic')!;
    expect(nextTopic).toMatchObject({
      status: 'pending',
      ideaId: null,
      topicId: null,
      ideaDraft: { title: 'How should we organize mentoring?' },
    });
    expect((await listIdeas('hackathon')).filter((item) => item.kind === 'problem')).toEqual(previousTopics);
    expect((await post(`/suggestions/${nextTopic.id}/approve`)).status).toBe(200);
    const topicsAfterApproval = (await listIdeas('hackathon')).filter((item) => item.kind === 'problem');
    expect(topicsAfterApproval).toHaveLength(previousTopics.length + 1);
    for (const previousTopic of previousTopics) expect(topicsAfterApproval).toContainEqual(previousTopic);
    expect((await listSuggestions('hackathon')).find((s) => s.id === idea.id)?.status).toBe('pending');

    await speak('Let us keep exploring mentoring.');
    expect((await runLiveTick('hackathon', meetingId, revised.ai)).some((s) => s.kind === 'brainstorm_topic')).toBe(false);
    expect((await post(`/suggestions/${idea.id}/approve`)).status).toBe(200);
    expect((await listIdeas('hackathon')).find((item) => item.sourceSuggestionId === idea.id)).toMatchObject({
      title: 'Match by course',
      topicId: existingTopic.id,
    });
  });

  it('does not store meeting ideas for missing topics or topic records as developments', async () => {
    await speak('What if we add a new option?');
    const topic = (await listIdeas('hackathon')).find((item) => item.kind === 'problem')!;
    const { ai } = fakeAi(() => ({
      ideas: [
        {
          topicId: 'missing-topic',
          ideaId: null,
          draft: { title: 'Unscoped idea', description: '', theme: 'Option' },
          reason: 'r',
          quote: null,
          sourceLineId: null,
        },
        {
          topicId: topic.id,
          ideaId: topic.id,
          draft: { title: 'Change topic through idea', description: '', theme: 'Option' },
          reason: 'r',
          quote: null,
          sourceLineId: null,
        },
      ],
    }));
    expect((await runLiveTick('hackathon', meetingId, ai)).filter((item) => item.kind === 'idea')).toEqual([]);
  });

  it('reads typed chat lines like speech, tagged as chat', async () => {
    const said = await speak('Let us ship login first');
    const typed = (await post<TranscriptLine>(`/meetings/${meetingId}/lines`, { text: 'Google login link', source: 'chat' })).body;
    expect(said.source).toBe('voice');
    expect(typed.source).toBe('chat');
    const { ai, inputs } = fakeAi(() => ({
      actionItems: [
        {
          title: 'Add Google login',
          assigneeId: null,
          priority: 'medium',
          include: true,
          reason: 'linked',
          quote: null,
          sourceLineId: typed.id,
        },
      ],
    }));
    const [action] = await runLiveTick('hackathon', meetingId, ai);
    const names = inputs[0]!.lines.map((l) => l.speakerName);
    expect(names[0]).not.toMatch(/\(chat\)$/);
    expect(names[1]).toMatch(/ \(chat\)$/);
    expect(action?.cite).toMatch(/^.+ · Meeting chat · \d\d:\d\d$/);
  });

  it('shares a file in the meeting chat and gives the AI passages from shared files only', async () => {
    const res = await fetch(`${base}/api/projects/hackathon/files`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-file-name': 'plan.txt',
        'x-file-type': 'text/plain',
        'x-member-id': 'alex',
      },
      body: 'Login ships first.',
    });
    const file = (await res.json()) as ProjectFile;
    const lines = `/meetings/${meetingId}/lines`;
    expect((await post(lines, { text: 'plan.txt', source: 'voice', fileId: file.id })).status).toBe(400);
    expect((await post(lines, { text: 'x', source: 'chat', fileId: 'nope' })).status).toBe(404);
    const shared = (await post<TranscriptLine>(lines, { text: 'plan.txt', source: 'chat', fileId: file.id })).body;
    expect(shared).toMatchObject({ fileId: file.id, text: 'plan.txt', source: 'chat' });

    const queries: string[] = [];
    const memory: ProjectMemory = {
      rememberFile: async () => null,
      forgetFile: async () => {},
      excerpts: async (_projectId, query) => {
        queries.push(query);
        return [
          { name: 'plan.txt', text: 'Login ships first.', documentId: 'doc-plan' },
          // Same name, different project file that was never shared in this meeting.
          { name: 'plan.txt', text: 'Not shared in this meeting.', documentId: 'doc-other' },
        ];
      },
    };
    await setMemoryDocumentId('hackathon', file.id, 'doc-plan');
    const { ai, inputs } = fakeAi(() => ({}));
    await runLiveTick('hackathon', meetingId, ai, memory);
    expect(queries[0]).toContain('plan.txt');
    expect(inputs[0]!.files).toEqual([{ name: 'plan.txt', text: 'Login ships first.', documentId: 'doc-plan' }]);
    expect(inputs[0]!.lines.at(-1)!.text).toBe('(shared a file) plan.txt');
  });

  it('answers @AI in the meeting chat from the shared file, and live ticks skip the reply', async () => {
    const lines = `/meetings/${meetingId}/lines`;
    expect((await post(lines, { text: 'fake reply', source: 'ai' })).status).toBe(400);
    await post(lines, { text: '@AI read the file and summarize it', source: 'chat' });
    const seen: FileExcerpt[][] = [];
    const ai = {
      runMention: async (input: { files?: FileExcerpt[] }) => {
        seen.push(input.files ?? []);
        return { reply: 'The plan says login ships first.' };
      },
    } as unknown as AiProvider;
    // No Agent Memory: shared text files are still read whole.
    const [reply] = await answerMeetingMention('hackathon', meetingId, 'alex', ai, null);
    expect(seen[0]).toEqual([{ name: 'plan.txt', text: 'Login ships first.' }]);
    expect(reply).toMatchObject({ source: 'ai', speakerId: 'alex', text: 'The plan says login ships first.' });

    const { ai: tickAi, inputs } = fakeAi(() => ({}));
    await runLiveTick('hackathon', meetingId, tickAi, null);
    expect(inputs[0]!.lines.some((l) => l.text.includes('login ships first'))).toBe(false);
    expect((await getMeeting('hackathon', meetingId)).aiCursor).toBe(reply!.id);
  });

  it('POST /ai {enabled:false} stops ticks; only participants may toggle', async () => {
    expect((await post(`/meetings/${meetingId}/ai`, { enabled: false }, 'jamie')).status).toBe(403);
    const off = await post<Meeting>(`/meetings/${meetingId}/ai`, { enabled: false });
    expect(off.body.aiEnabled).toBe(false);
    await speak('Silent now');
    const { ai, inputs } = fakeAi(() => ({}));
    expect(await runLiveTick('hackathon', meetingId, ai)).toEqual([]);
    expect(inputs).toHaveLength(0);
    // @AI stays quiet too: nothing goes to the model.
    let asked = false;
    const mention = { runMention: async () => ((asked = true), { reply: 'x' }) } as unknown as AiProvider;
    expect(await answerMeetingMention('hackathon', meetingId, 'alex', mention, null)).toEqual([]);
    expect(asked).toBe(false);
  });
});
