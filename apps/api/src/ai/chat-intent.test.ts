import { expect, it, vi } from 'vitest';
import { createStructuredProvider } from './structured.js';

it('passes the current message, speaker history and existing topics to structured intent extraction', async () => {
  const output = {
    action: 'create_topic',
    explicitRequest: true,
    requestQuote: 'I woiuld like to create a Fitness app for students',
    title: 'Fitness app for students',
    titleSourceMessageId: 'm2',
    topicId: null,
    topicReference: null,
  };
  const parse = vi.fn().mockResolvedValue({ output, usage: { inputTokens: 0, outputTokens: 0 } });
  const ai = createStructuredProvider({ parse }, 'test-model');
  const input = {
    message: { id: 'm2', authorId: 'alex', authorName: 'Alex', text: output.requestQuote },
    recentMessages: [{ id: 'm1', authorId: 'jamie', authorName: 'Jamie', text: 'We already have a student nutrition board.' }],
    topics: [{ id: 'nutrition', title: 'Student nutrition', description: 'Plan affordable meals.' }],
  };
  expect(await ai.interpretChatIntent(input)).toEqual(output);
  const request = parse.mock.calls[0]![0];
  expect(JSON.parse(request.content)).toEqual(input);
  expect(request.system).toContain('spelling mistakes');
  expect(request.system).toContain('Only the latest member message authorizes an action');
  expect(request.system).toContain('semantic paraphrases');
  expect(request.system).toContain('not a new topic called workout reminders');
  expect(request.system).toContain('reported/quoted requests');
  expect(request.system).toContain('If there is exactly one topic, use it');
  expect(request.system).toContain('explicitRequest=false');
  expect(request.system).toContain('Neither requires the word "idea"');
});

it('rejects malformed intent output rather than allowing an unsupported action', async () => {
  const parse = vi.fn().mockResolvedValue({
    output: {
      action: 'delete_topic',
      explicitRequest: true,
      requestQuote: 'delete it',
      title: null,
      titleSourceMessageId: null,
      topicId: 't1',
      topicReference: null,
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  });
  const ai = createStructuredProvider({ parse }, 'test-model');
  await expect(
    ai.interpretChatIntent({
      message: { id: 'm', authorId: 'alex', authorName: 'Alex', text: 'delete it' },
      recentMessages: [],
      topics: [],
    }),
  ).rejects.toThrow();
});
