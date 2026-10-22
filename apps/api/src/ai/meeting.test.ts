import { describe, expect, it, vi } from 'vitest';
import { createAnthropicMeetingAi } from './anthropic-meeting.js';
import { mockMeetingAi } from './mock-meeting.js';
import { validateTick, type MeetingTickInput, type RawTick } from './meeting.js';

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

describe('Claude meeting AI', () => {
  it('passes the transcript in tags, uses the fast model with low effort and reads usage', async () => {
    const parse = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      parsed_output: raw({ runningSummary: 'ok' }),
      usage: { input_tokens: 12, output_tokens: 3 },
    });
    const ai = createAnthropicMeetingAi('k', 'claude-haiku-5-5', 'main', { messages: { parse } } as never);
    const out = await ai.meetingTick(input);
    const req = parse.mock.calls[0]![0];
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req.output_config.effort).toBe('low');
    expect(req).not.toHaveProperty('temperature');
    expect(req.messages[0].content).toContain('<transcript>');
    expect(req.messages[0].content).toContain("[l1] Alex: I'll set up the CI pipeline.");
    expect(out.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it('throws on refusal and truncation', async () => {
    for (const stop_reason of ['refusal', 'max_tokens']) {
      const parse = vi.fn().mockResolvedValue({ stop_reason, parsed_output: null });
      const ai = createAnthropicMeetingAi('k', 'f', 'm', { messages: { parse } } as never);
      await expect(ai.meetingTick(input)).rejects.toThrow();
    }
  });
});
