import { describe, expect, it, vi } from 'vitest';
import { createStructuredMeetingAi } from './structured-meeting.js';
import { mockMeetingAi } from './mock-meeting.js';
import { validateSummary, validateTick, type MeetingTickInput, type RawSummary, type RawTick, type SummarizeInput } from './meeting.js';

const input: MeetingTickInput = {
  lines: [
    { id: 'l1', speakerId: 'alex', speakerName: 'Alex', text: "I'll set up the CI pipeline." },
    { id: 'l2', speakerId: 'jamie', speakerName: 'Jamie', text: 'What if we add a dark mode?' },
    { id: 'l3', speakerId: 'taylor', speakerName: 'Taylor', text: 'I like React, but Vue is simpler.' },
  ],
  runningSummary: 'Earlier: planning.',
  carryOver: [],
  ideas: [{ id: 'i1', title: 'Dark mode' }],
  taskTitles: [],
  alreadySuggested: ['New idea: Offline sync', 'Poll: Pick a framework'],
  members: [
    { id: 'alex', name: 'Alex', role: 'Dev' },
    { id: 'jamie', name: 'Jamie', role: 'Design' },
  ],
};

const raw = (over: Partial<RawTick> = {}): RawTick => ({
  actionItems: [],
  ideas: [],
  polls: [],
  runningSummary: '',
  ...over,
});
const idea = (over = {}) => ({ ideaId: null, title: 'T', description: '', theme: 'product', reason: 'r', quote: null, ...over });

describe('validateTick', () => {
  it('keeps a cited topic separate from ideas and drops repeats', () => {
    const topic = {
      title: 'How should we organize study groups?',
      description: 'For students',
      reason: 'The team asked.',
      quote: 'What if we add a dark mode?',
    };
    const out = validateTick(raw({ topic, ideas: [idea({ title: 'Match by course' })] }), input);
    expect(out.topic).toMatchObject({ title: topic.title, sourceLineId: 'l2' });
    expect(out.ideas).toHaveLength(1);
    expect(validateTick(raw({ topic }), { ...input, currentTopic: { id: 'p1', title: topic.title } }).topic).toBeNull();
    expect(validateTick(raw({ topic }), { ...input, alreadySuggested: [`Brainstorm topic: ${topic.title}`] }).topic).toBeNull();
  });
  it('drops unknown idea ids, member ids and quotes that are not in the input', () => {
    const out = validateTick(
      raw({
        actionItems: [{ title: 'Do it', assigneeId: 'stranger', priority: 'URGENT', reason: 'r', quote: 'never said' }],
        ideas: [idea({ ideaId: 'i-other' }), idea({ ideaId: 'i1', title: 'Develop dark mode' })],
      }),
      input,
    );
    expect(out.actionItems[0]).toMatchObject({ assigneeId: null, priority: 'medium', quote: null, sourceLineId: null });
    expect(out.ideas.map((i) => i.ideaId)).toEqual(['i1']);
  });

  it('keeps verbatim quotes and links the source line', () => {
    const out = validateTick(
      raw({ actionItems: [{ title: 'CI', assigneeId: 'alex', priority: 'high', reason: 'r', quote: '“set UP the ci pipeline”' }] }),
      input,
    );
    expect(out.actionItems[0]).toMatchObject({ assigneeId: 'alex', priority: 'high', sourceLineId: 'l1' });
  });

  it('drops polls with bad option counts, repeats of alreadySuggested and duplicates', () => {
    const poll = (question: string, options: string[]) => ({ question, options, reason: 'r', quote: null });
    const out = validateTick(
      raw({
        polls: [
          poll('Q1', ['a']),
          poll('Q2', ['a', 'b', 'c', 'd', 'e', 'f']),
          poll('Q3', ['a', ' ']),
          poll('pick a framework', ['a', 'b']),
          poll('OK', ['a', 'b']),
        ],
        ideas: [idea({ title: 'offline SYNC' }), idea({ title: 'Fresh' }), idea({ title: 'fresh' })],
      }),
      input,
    );
    expect(out.polls.map((p) => p.draft.question)).toEqual(['OK']);
    expect(out.ideas.map((i) => i.draft.title)).toEqual(['Fresh']);
  });

  it('trims the running summary to 150 words', () => {
    const out = validateTick(raw({ runningSummary: Array(200).fill('w').join(' ') }), input);
    expect(out.runningSummary.split(' ')).toHaveLength(150);
  });
});

describe('reason and quote caps', () => {
  it('caps reason at 400 and quote at 600 characters', () => {
    const long = 'word '.repeat(200).trim();
    const lines = [{ id: 'l1', speakerId: 'alex', speakerName: 'Alex', text: long }];
    const item = { title: 'T', assigneeId: null, priority: 'low', reason: 'r'.repeat(900), quote: long };
    const tick = validateTick(raw({ actionItems: [item] }), { ...input, lines });
    expect(tick.actionItems[0].reason).toHaveLength(400);
    expect(tick.actionItems[0].quote).toHaveLength(600);
    const sum = { overview: '', decisions: [], openQuestions: [], nextSteps: [] };
    const out = validateSummary({ summary: sum, actionItems: [item], carryOverItems: [] }, {
      ...input,
      lines,
      suggestions: [],
    } as unknown as SummarizeInput);
    expect(out.actionItems[0].reason).toHaveLength(400);
    expect(out.actionItems[0].quote).toHaveLength(600);
  });
});

describe('mock meeting AI', () => {
  it('proposes a ticket, an idea and a poll from cue phrases', async () => {
    const out = await mockMeetingAi.meetingTick(input);
    expect(out.actionItems).toMatchObject([{ assigneeId: 'alex', sourceLineId: 'l1' }]);
    expect(out.ideas).toMatchObject([{ ideaId: null, sourceLineId: 'l2' }]);
    expect(out.polls[0]?.draft.options).toEqual(['What if we add a dark mode?', 'I like React, but Vue is simpler.']);
    expect(out.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(mockMeetingAi.isMock).toBe(true);
  });

  it('understands Korean cues', async () => {
    const out = await mockMeetingAi.meetingTick({
      ...input,
      alreadySuggested: [],
      lines: [
        { id: 'k1', speakerId: 'alex', speakerName: 'Alex', text: '로그인은 제가 할게요' },
        { id: 'k2', speakerId: 'jamie', speakerName: 'Jamie', text: '다크 모드 어때?' },
      ],
    });
    expect(out.actionItems).toHaveLength(1);
    expect(out.ideas).toHaveLength(1);
  });
});

describe('structured meeting AI', () => {
  it('passes the transcript in tags, uses the fast model and reads usage', async () => {
    const parse = vi.fn().mockResolvedValue({
      output: raw({ runningSummary: 'ok' }),
      usage: { inputTokens: 12, outputTokens: 3 },
    });
    const ai = createStructuredMeetingAi({ parse }, 'gpt-fast', 'main');
    const out = await ai.meetingTick(input);
    const req = parse.mock.calls[0]![0];
    expect(req.model).toBe('gpt-fast');
    expect(req.maxTokens).toBe(4000);
    expect(req.content).toContain('<transcript>');
    expect(req.content).toContain('<current_topic>');
    expect(req.content).toContain("[l1] Alex: I'll set up the CI pipeline.");
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it('throws when the model call fails', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('The model declined this request'));
    const ai = createStructuredMeetingAi({ parse }, 'f', 'm');
    await expect(ai.meetingTick(input)).rejects.toThrow(/declined/);
  });
});

const sumInput: SummarizeInput = {
  lines: input.lines,
  carryOver: ['Old note'],
  ideas: [],
  taskTitles: [],
  suggestions: [
    { title: '1 action item from the meeting', status: 'pending' },
    { title: 'Set up CI', status: 'approved' },
  ],
  members: input.members,
};
const rawSummary = (over: Partial<RawSummary> = {}): RawSummary => ({
  summary: { overview: 'o', decisions: [], openQuestions: [], nextSteps: [] },
  actionItems: [],
  carryOverItems: [],
  ...over,
});
const item = (over = {}) => ({ title: 'T', assigneeId: null, priority: 'high', reason: 'r', quote: null, ...over });

describe('validateSummary', () => {
  it('checks quotes, assignees and dedupes against suggestions and itself', () => {
    const out = validateSummary(
      rawSummary({
        actionItems: [
          item({ title: 'set up ci' }),
          item({ title: 'Ship it', assigneeId: 'stranger', quote: 'never said' }),
          item({ title: 'SHIP IT' }),
          item({ title: 'Verbatim', assigneeId: 'alex', quote: 'set up the CI' }),
        ],
      }),
      sumInput,
    );
    expect(out.actionItems.map((i) => i.title)).toEqual(['Ship it', 'Verbatim']);
    expect(out.actionItems[0]).toMatchObject({ assigneeId: null, quote: null, include: true });
    expect(out.actionItems[1]).toMatchObject({ assigneeId: 'alex', quote: 'set up the CI' });
  });

  it('caps the overview and lists, and trims carry-over items', () => {
    const out = validateSummary(
      rawSummary({
        summary: { overview: Array(200).fill('w').join(' '), decisions: Array(20).fill('d'), openQuestions: [' ', 'q'], nextSteps: [] },
        carryOverItems: [' ', ...Array(12).fill('n'), 'x'.repeat(300)],
      }),
      sumInput,
    );
    expect(out.summary.overview.split(' ')).toHaveLength(120);
    expect(out.summary.decisions).toHaveLength(10);
    expect(out.summary.openQuestions).toEqual(['q']);
    expect(out.carryOverItems).toHaveLength(10);
    expect(out.carryOverItems.every((n) => n.length <= 120)).toBe(true);
  });
});

describe('mock summarizeMeeting', () => {
  it('builds an overview from speaker turns and uses cues', async () => {
    const out = await mockMeetingAi.summarizeMeeting({
      ...sumInput,
      suggestions: [],
      lines: [
        { id: 'a', speakerId: 'alex', speakerName: 'Alex', text: 'We decided to use React. It is fast.' },
        { id: 'b', speakerId: 'alex', speakerName: 'Alex', text: 'More from me.' },
        { id: 'c', speakerId: 'jamie', speakerName: 'Jamie', text: 'Which host do we pick?' },
        { id: 'd', speakerId: 'alex', speakerName: 'Alex', text: "I'll set up the CI pipeline." },
      ],
    });
    expect(out.summary.overview).toBe("We decided to use React. Which host do we pick? I'll set up the CI pipeline.");
    expect(out.summary.decisions).toEqual(['We decided to use React. It is fast.']);
    expect(out.summary.openQuestions).toEqual(['Which host do we pick?']);
    expect(out.summary.nextSteps).toEqual(['Set up the CI pipeline']);
    expect(out.carryOverItems).toEqual(['Which host do we pick?']);
    expect(out.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});

describe('structured summarizeMeeting', () => {
  it('uses the main model and tagged data', async () => {
    const parse = vi.fn().mockResolvedValue({
      output: rawSummary(),
      usage: { inputTokens: 40, outputTokens: 9 },
    });
    const ai = createStructuredMeetingAi({ parse }, 'fast', 'gpt-main');
    const out = await ai.summarizeMeeting(sumInput);
    const req = parse.mock.calls[0]![0];
    expect(req).toMatchObject({ model: 'gpt-main', maxTokens: 16000 });
    expect(req.content).toContain('<carry_over>\nOld note\n</carry_over>');
    expect(req.content).toContain('<suggestions>');
    expect(req.content).toContain("[l1] Alex: I'll set up the CI pipeline.");
    expect(out.usage).toEqual({ inputTokens: 40, outputTokens: 9 });
  });

  it('throws when the model call fails', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('The model’s answer was cut off'));
    const ai = createStructuredMeetingAi({ parse }, 'f', 'm');
    await expect(ai.summarizeMeeting(sumInput)).rejects.toThrow(/cut off/);
  });
});
