import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Idea, Suggestion, WorkspaceSnapshot } from '@project-room/shared';
import { createApp } from './app.js';
import { closeDb, connectDb, getDb } from './db/client.js';
import { seedDemoData } from './db/seed.js';
import { createSuggestion } from './repositories/suggestions.js';
import { migrateLegacyTopics, resetTopic } from './repositories/brainstorm-topics.js';
import * as queries from './db/query.js';
import { researchWeb } from './services/research.js';
import { runBrainstormAction } from './services/brainstorm.js';
import { rid } from './db/records.js';
import { createMessage, listMessages } from './repositories/messages.js';
import { onMessagePosted } from './services/ai-engine.js';
import { parseChatCommand } from './services/chat-commands.js';
import { aiStrategyPlanSchema, readStrategyPlan } from '@project-room/shared';
import { getAiProvider } from './ai/index.js';
import { AiRequestError } from './ai/openai.js';
import type { ChatIntent } from './ai/provider.js';

vi.mock('./services/research.js', () => ({ researchWeb: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
let server: Server;
let base: string;
const web = vi.mocked(researchWeb);
beforeAll(async () => {
  await connectDb('mem://');
  await seedDemoData();
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api/projects/hackathon`;
});
beforeEach(async () => {
  await getDb().query('DELETE idea; DELETE suggestion;').collect();
  web.mockReset();
  web.mockResolvedValue({ configured: false, results: [], error: null });
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});
async function call<T>(method: string, path: string, body?: unknown, member = 'alex') {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-member-id': member },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (res.status === 204 ? null : await res.json()) as T };
}
const topic = async (title = 'Student deadline planning') => (await call<Idea>('POST', '/ideas', { kind: 'problem', title })).body;
const card = async (topicId: string, theme = 'Option') =>
  (await call<Idea>('POST', '/ideas', { topicId, title: 'A concrete approach', theme })).body;
const snapshot = async () => (await call<WorkspaceSnapshot>('GET', '/snapshot')).body;

const extracted = (overrides: Partial<ChatIntent> = {}): ChatIntent => ({
  action: 'none',
  explicitRequest: false,
  requestQuote: null,
  title: null,
  titleSourceMessageId: null,
  topicId: null,
  topicReference: null,
  ...overrides,
});

it('adds the reported direct contribution using a shortened target among several topics', async () => {
  await getDb().query('DELETE message;').collect();
  const fitness = await topic('Fitness app for students with limited equipment');
  await topic('Student meal planning');
  const interpret = vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'add_idea',
      explicitRequest: true,
      requestQuote: message.text,
      title: 'no-equipment dorm workouts',
      titleSourceMessageId: message.id,
      topicReference: 'the fitness app',
    }),
  );
  expect(await command('I want to add no-equipment dorm workouts to the fitness app')).toBe(
    'Added idea “no-equipment dorm workouts” to topic “Fitness app for students with limited equipment”.',
  );
  expect(interpret).toHaveBeenCalledOnce();
  expect((await snapshot()).ideas.find((item) => item.title === 'no-equipment dorm workouts')).toMatchObject({
    kind: 'idea',
    topicId: fitness.id,
    authorId: 'alex',
  });
});

it('uses the sole topic for an implicit direct contribution', async () => {
  const fitness = await topic('Fitness app for students with limited equipment');
  vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'add_idea',
      explicitRequest: true,
      requestQuote: message.text,
      title: 'no-equipment dorm workouts',
      titleSourceMessageId: message.id,
    }),
  );
  expect(await command('I want to add no-equipment dorm workouts')).toContain('Added idea');
  expect((await snapshot()).ideas.find((item) => item.title === 'no-equipment dorm workouts')?.topicId).toBe(fitness.id);
});

it('captures the reported tentative idea for review and creates a card only after approval', async () => {
  await getDb().query('DELETE message;').collect();
  const fitness = await topic('Fitness app for students with limited equipment');
  vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'suggest_idea',
      explicitRequest: false,
      requestQuote: message.text,
      title: 'no-equipment dorm workouts',
      titleSourceMessageId: message.id,
      topicReference: 'the fitness app',
    }),
  );
  const text = 'I am thinking of adding no-equipment dorm workouts to the fitness app';
  await command(text);
  await command(text);
  const before = await snapshot();
  expect(before.ideas).toHaveLength(1);
  expect(before.suggestions).toHaveLength(1);
  const draft = before.suggestions[0]!;
  expect(draft).toMatchObject({
    kind: 'idea',
    status: 'pending',
    topicId: fitness.id,
    topicVersion: fitness.boardVersion,
    quote: text,
    ideaDraft: { title: 'no-equipment dorm workouts' },
  });
  expect(draft.reason).toContain(fitness.title);
  expect(draft.sourceMessageId).toBeTruthy();
  // Untagged tentative contributions don't interrupt chat with an assistant reply.
  expect((await listMessages('hackathon', 'hackathon-general')).at(-1)?.authorId).toBe('alex');
  expect((await call('POST', `/suggestions/${draft.id}/approve`, {})).status).toBe(200);
  expect((await snapshot()).ideas.find((item) => item.title === 'no-equipment dorm workouts')).toMatchObject({
    topicId: fitness.id,
    sourceSuggestionId: draft.id,
  });
});

it('keeps semantic topic selection from the model when the reference uses different words', async () => {
  const fitness = await topic('Student movement with minimal equipment');
  await topic('Meal planning');
  vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'add_idea',
      explicitRequest: true,
      requestQuote: message.text,
      title: 'dorm workouts',
      titleSourceMessageId: message.id,
      topicId: fitness.id,
      topicReference: 'the fitness app',
    }),
  );
  expect(await command('Add dorm workouts to the fitness app')).toContain('Added idea');
  expect((await snapshot()).ideas.find((item) => item.title === 'dorm workouts')?.topicId).toBe(fitness.id);
});

it('does not redirect an explicitly unknown target or guess between multiple similar topic names', async () => {
  const fitness = await topic('Fitness app for students with limited equipment');
  const interpret = vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'suggest_idea',
      explicitRequest: false,
      requestQuote: message.text,
      title: 'recipe reminders',
      titleSourceMessageId: message.id,
      topicReference: 'the meal app',
    }),
  );
  expect(await command('I am considering recipe reminders for the meal app')).toContain('Please clarify');
  await topic('Fitness app for commuters');
  interpret.mockImplementation(async ({ message }) =>
    extracted({
      action: 'add_idea',
      explicitRequest: true,
      requestQuote: message.text,
      title: 'dorm workouts',
      titleSourceMessageId: message.id,
      topicReference: 'the fitness app',
    }),
  );
  expect(await command('Add dorm workouts to the fitness app')).toContain('Please clarify');
  expect((await snapshot()).ideas).toHaveLength(2);
  expect((await snapshot()).suggestions).toHaveLength(0);
  expect((await snapshot()).ideas).toContainEqual(fitness);
});

it('uses contextual intent extraction for a misspelled creation request and a different contribution verb', async () => {
  await getDb().query('DELETE message;').collect();
  const other = await topic('Meal planning');
  const interpret = vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message, topics }) => {
    if (message.text.includes('woiuld'))
      return extracted({
        action: 'create_topic',
        explicitRequest: true,
        requestQuote: message.text,
        title: 'Fitness app for students with limited equipment',
        titleSourceMessageId: message.id,
      });
    return extracted({
      action: 'add_idea',
      explicitRequest: true,
      requestQuote: message.text,
      title: 'No-equipment dorm workouts',
      titleSourceMessageId: message.id,
      topicId: topics.find((item) => item.id !== other.id)!.id,
    });
  });
  expect(await command('I woiuld like to create a Fitness app for students with limited equipment')).toContain('Created topic');
  expect(await command('Put No-equipment dorm workouts under the fitness thing we just discussed')).toContain('Added idea');
  const input = interpret.mock.calls[1]![0];
  expect(input.recentMessages.some((item) => item.text.includes('woiuld'))).toBe(true);
  expect(input.topics.map((item) => item.title)).toEqual(['Meal planning', 'Fitness app for students with limited equipment']);
  const board = await snapshot();
  const fitness = board.ideas.find((item) => item.title.startsWith('Fitness'))!;
  expect(board.ideas.find((item) => item.title === 'No-equipment dorm workouts')?.topicId).toBe(fitness.id);
  expect(board.suggestions).toHaveLength(0);
  expect(web).not.toHaveBeenCalled();
});

it('uses semantic existing-topic selection without resetting its saved cards', async () => {
  const fitness = await topic('Student fitness with minimal gear');
  const saved = await card(fitness.id);
  vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'use_topic',
      explicitRequest: true,
      requestQuote: message.text,
      topicId: fitness.id,
    }),
  );
  expect(await command('I want to build an exercise app for students who have little equipment')).toContain('already exists');
  expect((await snapshot()).ideas).toEqual(expect.arrayContaining([fitness, saved]));
  expect((await snapshot()).ideas).toHaveLength(2);
});

it('uses same-member history for an explicit contextual follow-up but rejects a different member’s title', async () => {
  await getDb().query('DELETE message;').collect();
  const titleMessage = await createMessage({
    projectId: 'hackathon',
    channelId: 'hackathon-general',
    authorId: 'alex',
    text: 'A campus workout planner',
  });
  vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'create_topic',
      explicitRequest: true,
      requestQuote: message.text,
      title: titleMessage.text,
      titleSourceMessageId: titleMessage.id,
    }),
  );
  expect(await command('Yes, make that a topic', 'hackathon-general', 'jamie')).toContain('Please clarify');
  expect((await snapshot()).ideas).toHaveLength(0);
  expect(await command('Yes, make that a topic')).toContain('Created topic');
  expect((await snapshot()).ideas).toHaveLength(1);
});

it('does not execute uncertain, invented, foreign or unsupported intent extractions', async () => {
  await getDb().query('DELETE message;').collect();
  await topic('Dinner');
  const interpret = vi.spyOn(getAiProvider(), 'interpretChatIntent');
  const invalid: Partial<ChatIntent>[] = [
    { action: 'clarify' },
    { action: 'create_topic', explicitRequest: false },
    { action: 'create_topic', explicitRequest: true, requestQuote: 'Invented instruction' },
    { action: 'create_topic', explicitRequest: true, title: 'Invented title' },
    { action: 'add_idea', explicitRequest: true, title: 'Dorm workouts', topicId: 'foreign-or-deleted' },
    { action: 'add_idea', explicitRequest: true, title: 'Dorm workouts', topicId: null, topicReference: 'the fitness topic' },
  ];
  for (const result of invalid) {
    interpret.mockImplementation(async ({ message }) =>
      extracted({
        requestQuote: message.text,
        titleSourceMessageId: message.id,
        ...result,
      }),
    );
    expect(await command('Put Dorm workouts under the fitness topic')).toContain('Please clarify');
  }
  expect((await snapshot()).ideas).toHaveLength(1);
});

it('accepts the reported lowercase creation request when the model capitalizes its quote and title', async () => {
  await getDb().query('DELETE message;').collect();
  const request = 'i want to create a fitness app for students with limited equipment';
  const interpret = vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'create_topic',
      explicitRequest: true,
      requestQuote: 'I want to create a Fitness app for students with limited equipment',
      title: 'Fitness  app for students with limited equipment',
      titleSourceMessageId: message.id,
    }),
  );
  expect(await command(request)).toBe('Created topic “fitness app for students with limited equipment”.');
  expect(interpret).toHaveBeenCalledOnce();
  expect((await snapshot()).ideas).toMatchObject([
    { kind: 'problem', title: 'fitness app for students with limited equipment', authorId: 'alex' },
  ]);
});

it('rechecks an unnecessary clarification once before creating a sufficiently named goal', async () => {
  const request = 'i want to create a fitness app for students with limited equipment';
  const interpret = vi
    .spyOn(getAiProvider(), 'interpretChatIntent')
    .mockResolvedValueOnce(extracted({ action: 'clarify' }))
    .mockImplementationOnce(async ({ message }) =>
      extracted({
        action: 'create_topic',
        explicitRequest: true,
        requestQuote: message.text,
        title: 'fitness app for students with limited equipment',
        titleSourceMessageId: message.id,
      }),
    );
  expect(await command(request)).toContain('Created topic');
  expect(interpret).toHaveBeenCalledTimes(2);
  expect(interpret.mock.calls[1]![0].validationFeedback).toContain('New topics need neither an idea nor an existing topic id');
});

it('bounds interpretation repairs and still rejects fabricated title content', async () => {
  vi.spyOn(getAiProvider(), 'interpretChatIntent').mockImplementation(async ({ message }) =>
    extracted({
      action: 'create_topic',
      explicitRequest: true,
      requestQuote: message.text,
      title: 'Fitness app with fabricated recommendations',
      titleSourceMessageId: message.id,
    }),
  );
  expect(await command('i want to create a fitness app for students with limited equipment')).toContain('Please clarify');
  expect(getAiProvider().interpretChatIntent).toHaveBeenCalledTimes(2);
  expect((await snapshot()).ideas).toHaveLength(0);
});

it('passes only the current channel history to the interpreter and honors none even for a template-shaped message', async () => {
  await getDb().query('DELETE message;').collect();
  await createMessage({ projectId: 'hackathon', channelId: 'hackathon-design', authorId: 'alex', text: 'Secret design channel context' });
  const interpret = vi.spyOn(getAiProvider(), 'interpretChatIntent').mockResolvedValue(extracted());
  await command('I would like to create a Fitness app for students');
  expect((await snapshot()).ideas).toHaveLength(0);
  expect(interpret.mock.calls[0]![0].recentMessages).toEqual([]);
  await command('I do not want to build a Fitness app');
  await command('What if we made a workout app?');
  expect((await snapshot()).ideas).toHaveLength(0);
});

it('fails safely when intent interpretation is unavailable, while retaining literal commands', async () => {
  const interpret = vi.spyOn(getAiProvider(), 'interpretChatIntent').mockRejectedValue(new Error('Unavailable'));
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await command('I woiuld like to create a Fitness app for students');
  expect((await snapshot()).ideas).toHaveLength(0);
  expect(await command('create topic Fitness app for students')).toContain('Created topic');
  expect(interpret).toHaveBeenCalledTimes(2);
  expect(warning).toHaveBeenCalled();
});

/** Runs a posted member command through the same entry point used by the chat route. */
async function command(text: string, channelId = 'hackathon-general', authorId = 'alex') {
  const message = await createMessage({ projectId: 'hackathon', channelId, authorId, text });
  await onMessagePosted({ projectId: 'hackathon', channelName: 'general', message, members: new Map() });
  return (await listMessages('hackathon', channelId)).at(-1)!.text;
}

it('creates exactly named topics and ideas directly from member commands, with channel context', async () => {
  expect(await command('@AI create topic Weekend plans')).toBe('Created topic “Weekend plans”.');
  await topic('Dinner');
  expect(await command('@AI add idea pool')).toBe('Added idea “pool” to topic “Weekend plans”.');
  expect(await command('@AI add idea pizza to Dinner topic')).toBe('Added idea “pizza” to topic “Dinner”.');
  expect(await command('@AI create idea tacos in topic Dinner')).toBe('Added idea “tacos” to topic “Dinner”.');
  const board = await snapshot();
  const dinner = board.ideas.find((idea) => idea.title === 'Dinner')!;
  expect(board.ideas.find((idea) => idea.title === 'pizza')).toMatchObject({ topicId: dinner.id, authorId: 'alex', votingOpen: false });
  expect(board.ideas.find((idea) => idea.title === 'pool')?.topicId).not.toBe(dinner.id);
  expect(board.suggestions).toHaveLength(0);
  expect(web).not.toHaveBeenCalled();
});

it('creates the stated fitness topic without a mention and routes a natural idea to its shortened name', async () => {
  await getDb().query('DELETE message;').collect();
  expect(await command('I would like to create a Fitness app for students with limited equipment')).toBe(
    'Created topic “Fitness app for students with limited equipment”.',
  );
  await topic('Meal planning');
  expect(await command('I have an idea for No-equipment dorm workouts to Fitness app for students')).toBe(
    'Added idea “No-equipment dorm workouts” to topic “Fitness app for students with limited equipment”.',
  );
  const board = await snapshot();
  const fitness = board.ideas.find((idea) => idea.kind === 'problem' && idea.title.startsWith('Fitness'))!;
  expect(board.ideas.find((idea) => idea.title === 'No-equipment dorm workouts')).toMatchObject({
    authorId: 'alex',
    topicId: fitness.id,
    kind: 'idea',
    votingOpen: false,
  });
  expect(board.suggestions).toHaveLength(0);
  expect(web).not.toHaveBeenCalled();
});

it('reuses existing topics, establishes their channel context, and rejects duplicate ideas without a tag', async () => {
  await getDb().query('DELETE message;').collect();
  const fitness = await topic('Fitness app for students with limited equipment');
  await topic('Dinner');
  expect(await command('I want to create a fitness app for students')).toContain('already exists');
  expect(await command('I have an idea for No-equipment dorm workouts')).toContain(`to topic “${fitness.title}”`);
  expect(await command('add idea no equipment dorm workouts to Fitness app for students')).toContain('already exists');
  expect(await command('create topic FITNESS APP FOR STUDENTS WITH LIMITED EQUIPMENT')).toContain('already exists');
  expect((await snapshot()).ideas).toHaveLength(3);
});

it('asks for a full topic name on ambiguous or unknown natural requests without changing any board', async () => {
  await getDb().query('DELETE message;').collect();
  await topic('Fitness app for students with limited equipment');
  await topic('Fitness app for students who commute');
  expect(await command('I have an idea for Dorm workouts to Fitness app for students')).toContain('couldn’t identify');
  expect(await command('I would like to create a Fitness app for students')).toContain('More than one');
  expect(await command('I have an idea for Dorm workouts to Fitness app')).toContain('couldn’t identify');
  expect(await command('add idea meal suggestions to Meal planning')).toContain('couldn’t identify');
  expect(await command('I have an idea for Dorm workouts')).toContain('Which topic');
  expect((await snapshot()).ideas).toHaveLength(2);
});

it('keeps natural command context inside its channel and never matches another project', async () => {
  await getDb().query('DELETE message;').collect();
  await command('create topic Weekend plans');
  await topic('Dinner');
  expect(await command('I have an idea for Pool', 'hackathon-design')).toContain('Which topic');
  expect(await command('add idea Pool to Private topic topic')).toContain('couldn’t identify');
  expect((await snapshot()).ideas.every((idea) => idea.kind === 'problem')).toBe(true);
});

it('leaves questions, quoted instructions, tentative discussion and unrelated creation requests alone', async () => {
  const ordinary = [
    'Someone said @AI create topic Dinner',
    '"I would like to create a Fitness app for students"',
    'Yesterday I wanted to create a Fitness app for students',
    'Should we create a Fitness app for students?',
    'Maybe we could create a Fitness app for students',
    'I do not want to create a Fitness app for students',
    'I have no idea for Fitness app for students',
    'Can you suggest an idea for Fitness app for students?',
    'create task Write the demo script',
    'I want to create a poll about workouts',
  ];
  for (const text of ordinary) {
    expect(parseChatCommand(text), text).toBeNull();
    await command(text);
  }
  expect((await snapshot()).ideas).toHaveLength(0);
  expect(parseChatCommand('Let’s create a Fitness app for students')).toEqual({ kind: 'problem', title: 'Fitness app for students' });
  expect(parseChatCommand('Please add an idea "Dorm workouts" to topic "Fitness app for students"')).toEqual({
    kind: 'idea',
    title: 'Dorm workouts',
    topic: 'Fitness app for students',
  });
  expect(parseChatCommand('@AI add idea A way to exercise')).toEqual({ kind: 'idea', title: 'A way to exercise' });
  expect(parseChatCommand('I have an idea for "A way to exercise"')).toEqual({ kind: 'idea', title: 'A way to exercise' });
  expect(parseChatCommand('I have an idea for A way to exercise to Fitness app for students')).toEqual({
    kind: 'idea',
    title: 'A way to exercise',
    topic: 'Fitness app for students',
  });
  expect(await command(`create topic ${'a'.repeat(81)}`)).toContain('between 1 and 80');
});

it('does not guess unknown or ambiguous topic targets or reuse context across channels', async () => {
  await getDb().query('DELETE message;').collect();
  await command('@AI create topic Weekend plans');
  await topic('Dinner');
  expect(await command('@AI add idea pool', 'hackathon-design')).toContain('Which topic');
  expect(await command('@AI add idea pool to Missing topic')).toContain('couldn’t identify');
  await topic('weekend plans');
  expect(await command('@AI add idea pool to Weekend plans topic')).toContain('couldn’t identify');
  expect((await snapshot()).ideas.every((idea) => idea.kind === 'problem')).toBe(true);
});

it('rejects duplicate and invalid commands and accepts optional quotes and polite prefixes', async () => {
  expect(parseChatCommand('Someone said @AI create topic Dinner')).toBeNull();
  expect(parseChatCommand('@AI can you suggest an idea')).toBeNull();
  expect(await command('@AI please create topic "Dinner"')).toBe('Created topic “Dinner”.');
  expect(await command('@AI add topic dinner')).toContain('already exists');
  expect(await command('@AI add idea pizza to Dinner topic')).toContain('Added idea');
  expect(await command('@AI add idea PIZZA to topic dinner')).toContain('already exists');
  expect(await command(`@AI create topic ${'a'.repeat(81)}`)).toContain('between 1 and 80');
  expect(await command('@AI create topic')).toContain('between 1 and 80');
  expect((await snapshot()).ideas).toHaveLength(2);
});

it('resolves a sole topic but never a topic belonging to another project', async () => {
  await getDb().query('DELETE message;').collect();
  const only = await topic('Dinner');
  expect(await command('@AI add idea ramen')).toContain('Added idea “ramen” to topic “Dinner”');
  await getDb()
    .query(
      "CREATE project:private CONTENT { name: 'Private' }; CREATE idea:private CONTENT { projectId: project:private, kind: 'problem', title: 'Private topic', theme: 'Option', authorId: member:alex };",
    )
    .collect();
  expect(await command('@AI add idea pool to Private topic topic')).toContain('couldn’t identify');
  expect(await command('I have an idea for pool to topic Private topic')).toContain('couldn’t identify');
  expect((await snapshot()).ideas.filter((idea) => idea.kind === 'idea')).toMatchObject([{ title: 'ramen', topicId: only.id }]);
});

it('creates unassigned tasks from inline commands and same-member same-channel follow-ups', async () => {
  await getDb().query('DELETE message;').collect();
  const before = (await snapshot()).tasks.length;
  expect(await command('@AI create task Write the demo script')).toContain('Write the demo script');
  expect(await command('@AI create task')).toContain('next message');
  await command('Someone else is talking', 'hackathon-general', 'jamie');
  await command('A different channel', 'hackathon-design');
  expect((await snapshot()).tasks).toHaveLength(before + 1);
  expect(await command('Prepare the slides')).toContain('Created task');
  await command('An ordinary follow-up');
  const added = (await snapshot()).tasks.slice(before);
  expect(added.map((task) => task.title)).toEqual(['Write the demo script', 'Prepare the slides']);
  expect(added.every((task) => task.assigneeId === null && task.status === 'todo' && task.dueDate === null)).toBe(true);
  expect(await command(`@AI create task ${'x'.repeat(121)}`)).toContain('between 1 and 120');
  expect((await snapshot()).tasks).toHaveLength(before + 2);
});

it('caps AI strategies at six steps while members may save up to eight', () => {
  const plan = (count: number) => ({
    recommendation: 'Go.',
    steps: Array.from({ length: count }, (_, i) => `Step ${i + 1}.`),
    essentialScope: 'Core.',
  });
  expect(aiStrategyPlanSchema.safeParse(plan(6)).success).toBe(true);
  expect(aiStrategyPlanSchema.safeParse(plan(7)).success).toBe(false);
  expect(readStrategyPlan(JSON.stringify(plan(8)))?.steps).toHaveLength(8);
  expect(readStrategyPlan(JSON.stringify(plan(9)))).toBeNull();
});

it('condenses previously saved JSON strategies without requiring migration or losing compatibility', () => {
  const old = {
    goal: 'Old goal',
    context: '',
    assumptions: [],
    evidence: [],
    recommendation: { direction: 'Test a dorm workout flow.', rationale: 'Long explanation.', changeIf: 'Different needs.' },
    steps: [
      {
        title: 'Interview',
        focus: 'Users',
        why: 'Validation',
        action: 'Ask students about exercise. Compare their barriers. This extra detail should be hidden.',
        deliverable: 'Notes',
        successCriterion: 'Three examples',
        nextStep: 'Prototype',
      },
    ],
    scope: { essential: ['One audience', 'One core flow'], deferred: [] },
  };
  const plan = readStrategyPlan(JSON.stringify(old));
  expect(plan).toEqual({
    recommendation: 'Test a dorm workout flow.',
    steps: ['Ask students about exercise. Compare their barriers.'],
    essentialScope: 'One audience; One core flow',
  });
  expect(readStrategyPlan('Existing plain text')).toBeNull();
});

it('generates a concise strategy and preserves it through review, approval and editing', async () => {
  const problem = await topic('Fitness app for students with limited equipment');
  const drafts = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', topicId: problem.id });
  const strategy = drafts.body.find((item) => item.ideaDraft?.theme === 'Strategy')!;
  const description = strategy.ideaDraft!.description;
  expect(description.length).toBeLessThan(2000);
  const plan = readStrategyPlan(description)!;
  expect(Object.keys(plan)).toEqual(['recommendation', 'steps', 'essentialScope']);
  expect(plan.steps.length).toBeLessThanOrEqual(4);
  expect(plan.steps.every((step) => typeof step === 'string' && step.length <= 350)).toBe(true);
  expect(description).toContain('not a research finding');
  expect((await call('PATCH', `/suggestions/${strategy.id}`, { ideaDraft: { ...strategy.ideaDraft, description: '{}' } })).status).toBe(
    400,
  );
  const review = await call<Suggestion>('PATCH', `/suggestions/${strategy.id}`, { ideaDraft: strategy.ideaDraft });
  expect(review.status).toBe(200);
  expect(review.body.ideaDraft?.description).toBe(description);
  expect((await call('POST', `/suggestions/${strategy.id}/approve`, {})).status).toBe(200);
  const saved = (await snapshot()).ideas.find((idea) => idea.theme === 'Strategy')!;
  expect(saved.description).toBe(description);
  plan.essentialScope = 'Team note: start with interviews.';
  const edited = await call<Idea>('PATCH', `/ideas/${saved.id}`, {
    description: JSON.stringify(plan, null, 2),
    theme: 'Strategy',
  });
  expect(edited.status).toBe(200);
  expect(edited.body.description).toContain('Team note: start with interviews.');
  expect((await call('PATCH', `/ideas/${saved.id}`, { description: '{"goal":"Incomplete"}', theme: 'Strategy' })).status).toBe(400);
  expect((await call('PATCH', `/suggestions/${strategy.id}`, { ideaDraft: { ...strategy.ideaDraft, description: '{}' } })).status).toBe(
    409,
  );
  const refreshed = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'manual', topicId: problem.id });
  const refreshedStrategy = refreshed.body.find((item) => item.ideaDraft?.theme === 'Strategy')!;
  expect(refreshedStrategy.id).not.toBe(strategy.id);
  expect(refreshedStrategy.status).toBe('pending');
  expect(refreshedStrategy.ideaDraft!.description.length).toBeLessThan(2000);
  expect((await snapshot()).ideas.find((idea) => idea.id === saved.id)?.description).toBe(edited.body.description);
  expect(
    (await call('POST', '/ideas', { topicId: problem.id, title: 'Too much direct detail', description: 'x'.repeat(241) })).status,
  ).toBe(400);
});

it.each(['problem', 'idea'] as const)('rejects oversized description edits on a stored %s without changing its board', async (kind) => {
  const problem = await topic();
  const idea = await card(problem.id);
  const target = kind === 'problem' ? problem : idea;
  const before = await snapshot();
  for (const patch of [{ description: 'x'.repeat(241) }, { description: 'x'.repeat(241), theme: 'Option' }]) {
    const result = await call<{ issues: { path: string }[] }>('PATCH', `/ideas/${target.id}`, patch);
    expect(result.status).toBe(400);
    expect(result.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'description' })]));
    expect((await snapshot()).ideas).toEqual(before.ideas);
  }
  if (kind === 'problem') {
    expect((await call('PATCH', `/ideas/${target.id}`, { description: 'x'.repeat(241), theme: 'Strategy' })).status).toBe(400);
    expect((await snapshot()).ideas).toEqual(before.ideas);
  }
  expect((await call('PATCH', `/ideas/${target.id}`, { description: 'x'.repeat(240) })).status).toBe(200);
});

it('validates partial strategy edits and category changes against the saved description', async () => {
  const problem = await topic();
  const strategy = await card(problem.id, 'Strategy');
  const description = JSON.stringify({
    recommendation: 'Test the student problem before building. '.repeat(7),
    steps: ['Interview students about their last attempt to exercise.'],
    essentialScope: 'Keep only the core workout flow.',
  });
  expect(description.length).toBeGreaterThan(240);
  const saved = await call<Idea>('PATCH', `/ideas/${strategy.id}`, { description });
  expect(saved.status).toBe(200);
  for (const patch of [{ description: '{}' }, { description: '{invalid' }, { theme: 'Option' }]) {
    expect((await call('PATCH', `/ideas/${strategy.id}`, patch)).status).toBe(400);
    expect((await snapshot()).ideas.find((idea) => idea.id === strategy.id)).toEqual(saved.body);
  }
  expect((await call('PATCH', `/ideas/${strategy.id}`, { title: 'Updated strategy title' })).status).toBe(200);
  expect((await call('PATCH', `/ideas/${strategy.id}`, { theme: 'Option', description: 'A short direct idea.' })).status).toBe(200);
  expect((await call('PATCH', `/ideas/${strategy.id}`, { theme: 'Strategy', description: 'Existing plain text guidance.' })).status).toBe(
    200,
  );
});

it('keeps non-product preparation practical rather than imposing an MVP roadmap', async () => {
  const problem = await topic('What should we eat for dinner?');
  const drafts = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', topicId: problem.id });
  const guidance = drafts.body.find((item) => item.ideaDraft?.theme === 'Strategy')!.ideaDraft!.description;
  expect(guidance).toContain('allergies');
  expect(readStrategyPlan(guidance)?.steps[0]).toContain('preferences');
  expect(guidance).not.toContain('MVP');
  expect(guidance).not.toContain('Interview');
});

it('keeps web research available when AI classification is rate limited, then recovers summaries on retry', async () => {
  const problem = await topic('Fitness app for students with limited equipment');
  web.mockResolvedValue({
    configured: true,
    error: null,
    results: [
      {
        title: 'Student fitness app',
        url: 'https://example.com/fitness',
        content: 'This fitness app offers students bodyweight workouts without exercise equipment, designed for small spaces.',
      },
    ],
  });
  const classify = vi.spyOn(getAiProvider(), 'classifyBrainstorm').mockRejectedValueOnce(new AiRequestError(429, 'Daily token limit'));
  const first = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', topicId: problem.id });
  classify.mockRestore();
  expect(first.status).toBe(201);
  const source = first.body.find((item) => item.researchSources.length > 0)!;
  expect(source.researchSources[0]?.url).toBe('https://example.com/fitness');
  expect(source.proposal).toContain('summary is unavailable');
  expect(first.body.some((item) => item.ideaDraft?.theme === 'Strategy')).toBe(false);
  expect(first.body.find((item) => item.title === 'Topic research status')?.proposal).toContain('usage limit');
  const retry = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'manual', topicId: problem.id });
  expect(retry.status).toBe(201);
  expect(retry.body.find((item) => item.id === source.id)?.reason).not.toContain('summary unavailable');
  expect(retry.body.some((item) => item.ideaDraft?.theme === 'Strategy')).toBe(true);
});

it('brings only new sources when the team asks to research again', async () => {
  const problem = await topic('Fitness app for students with limited equipment');
  const source = (n: string) => ({
    title: `Student fitness app ${n}`,
    url: `https://${n}.example/fitness`,
    content: 'This fitness app offers students bodyweight workouts without exercise equipment, designed for small spaces.',
  });
  web.mockResolvedValue({ configured: true, error: null, results: [source('one')] });
  const first = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', topicId: problem.id });
  const urls = (items: Suggestion[]) =>
    items.filter((item) => item.title.startsWith('Topic research:')).flatMap((item) => item.researchSources.map((s) => s.url));
  expect(urls(first.body)).toEqual(['https://one.example/fitness']);

  web.mockResolvedValue({ configured: true, error: null, results: [source('one'), source('two')] });
  const again = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'manual', topicId: problem.id });
  expect(urls(again.body)).toEqual(['https://two.example/fitness']);

  const none = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'manual', topicId: problem.id });
  expect(none.body.find((item) => item.title === 'Topic research status')?.proposal).toContain('No new sources');
});

it('returns research and an honest status if strategy generation fails', async () => {
  const problem = await topic('Fitness app for students with limited equipment');
  web.mockResolvedValue({
    configured: true,
    error: null,
    results: [
      {
        title: 'Student fitness app',
        url: 'https://example.com/fitness',
        content: 'This fitness app offers students bodyweight workouts without exercise equipment, designed for small spaces.',
      },
    ],
  });
  const generate = vi.spyOn(getAiProvider(), 'facilitateBrainstorm').mockRejectedValueOnce(new Error('Invalid strategy JSON'));
  const result = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', topicId: problem.id });
  generate.mockRestore();
  expect(result.status).toBe(201);
  expect(result.body.some((item) => item.researchSources.length > 0)).toBe(true);
  expect(result.body.some((item) => item.ideaDraft?.theme === 'Strategy')).toBe(false);
  expect(result.body.find((item) => item.title === 'Topic research status')?.proposal).toContain('AI guidance is temporarily unavailable');
});

it('toggles hearts immediately without opening a vote or approving the idea', async () => {
  const problem = await topic();
  const idea = await card(problem.id);
  expect(idea.votingOpen).toBe(false);
  const first = await call<Idea>('POST', `/ideas/${idea.id}/vote`);
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ voterIds: ['alex'], approved: false, shortlisted: false, votingOpen: false });
  expect((await call<Idea>('POST', `/ideas/${idea.id}/vote`, undefined, 'jamie')).body.voterIds).toEqual(
    expect.arrayContaining(['alex', 'jamie']),
  );
  expect((await call<Idea>('POST', `/ideas/${idea.id}/vote`)).body.voterIds).toEqual(['jamie']);
  expect((await call('POST', `/ideas/${problem.id}/vote`)).status).toBe(409);
});

it('approves directly without shortlisting and rejects duplicate or topic approval', async () => {
  const problem = await topic();
  const idea = await card(problem.id);
  expect(idea.shortlisted).toBe(false);
  const approved = await call<Idea>('POST', `/ideas/${idea.id}/approve`);
  expect(approved.status).toBe(200);
  expect(approved.body).toMatchObject({ approved: true, shortlisted: false });
  expect((await call('POST', `/ideas/${idea.id}/approve`)).status).toBe(409);
  expect((await call('POST', `/ideas/${problem.id}/approve`)).status).toBe(409);
});

it('requires a topic and explicit selection when more than one exists', async () => {
  expect((await call('POST', '/ideas', { title: 'Unscoped' })).status).toBe(409);
  expect((await call('POST', '/ideas/actions', { trigger: 'manual' })).status).toBe(409);
  await topic();
  await topic('Second topic');
  expect((await call('POST', '/ideas', { title: 'Ambiguous' })).status).toBe(409);
  expect(web).not.toHaveBeenCalled();
});

it('keeps multiple topics independent, including AI inputs and project membership', async () => {
  const a = await topic();
  const b = await topic('Campus food waste campaign');
  const first = await card(a.id);
  const second = await card(b.id);
  expect(first.topicId).toBe(a.id);
  expect(second.topicId).toBe(b.id);
  expect((await call('POST', '/ideas/actions', { trigger: 'first_idea', topicId: a.id, ideaId: second.id })).status).toBe(409);
  expect((await call('POST', '/ideas', { topicId: first.id, title: 'Not a topic' })).status).toBe(404);
  await getDb()
    .query(
      "CREATE project:other CONTENT { name: 'Other' }; CREATE idea:foreign CONTENT { projectId: project:other, kind: 'problem', title: 'Private', theme: 'Option', authorId: member:alex }; ",
    )
    .collect();
  expect((await call('POST', '/ideas', { topicId: 'foreign', title: 'Cross project' })).status).toBe(404);
  const prepared = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', topicId: a.id });
  expect(prepared.status).toBe(201);
  expect(prepared.body.every((item) => item.topicId === a.id)).toBe(true);
  expect(prepared.body.filter((item) => item.kind === 'idea').every((item) => item.ideaDraft?.theme === 'Strategy')).toBe(true);
});

it('clears direct ideas and drafts but preserves research, saved strategies, strategy drafts and linked tasks', async () => {
  const a = await topic();
  const b = await topic('Another topic');
  const direct = await card(a.id);
  const strategy = await card(a.id, 'Strategy');
  const other = await card(b.id);
  const converted = await call<{ task: { id: string } }>('POST', `/ideas/${direct.id}/convert`, {});
  const research = await createSuggestion('hackathon', {
    kind: 'brainstorm_analysis',
    title: 'Similar work: source',
    reason: 'Evidence',
    proposal: 'Summary',
    ideaId: direct.id,
    researchSources: [{ title: 'Source', url: 'https://example.com/source' }],
  });
  const strategyDraft = await createSuggestion('hackathon', {
    kind: 'idea',
    title: 'Strategy draft',
    reason: 'Plan',
    originIdeaId: direct.id,
    ideaDraft: { title: 'Test with students', description: 'Interview users.', theme: 'Strategy' },
  });
  const draft = await createSuggestion('hackathon', {
    kind: 'idea',
    title: 'Option draft',
    reason: 'Option',
    originIdeaId: direct.id,
    ideaDraft: { title: 'An alternative', description: 'Try another route.', theme: 'Option' },
  });
  expect((await call('POST', `/ideas/${a.id}/clear-ideas`, {})).status).toBe(200);
  const state = await snapshot();
  expect(state.ideas.map((item) => item.id)).toEqual(expect.arrayContaining([a.id, b.id, strategy.id, other.id]));
  expect(state.ideas.some((item) => item.id === direct.id)).toBe(false);
  expect(state.suggestions.find((item) => item.id === research.id)?.ideaId).toBe(a.id);
  expect(state.suggestions.find((item) => item.id === strategyDraft.id)).toMatchObject({ topicId: a.id, originIdeaId: null });
  expect(state.suggestions.some((item) => item.id === draft.id)).toBe(false);
  expect(state.tasks.some((item) => item.id === converted.body.task.id)).toBe(true);
  expect((await call('POST', `/suggestions/${draft.id}/approve`, {})).status).toBe(404);
});

it('changing a topic clears its entire board and deleting a topic leaves the other tab intact', async () => {
  const a = await topic();
  const b = await topic('Another topic');
  await card(a.id);
  await card(a.id, 'Strategy');
  const other = await card(b.id);
  await createSuggestion('hackathon', {
    topicId: a.id,
    kind: 'brainstorm_analysis',
    title: 'Topic research',
    proposal: 'Evidence',
    reason: 'Research',
  });
  const changed = await call<Idea>('PATCH', `/ideas/${a.id}`, { title: 'New research question' });
  expect(changed.status).toBe(200);
  expect(changed.body.boardVersion).toBe(a.boardVersion + 1);
  let state = await snapshot();
  expect(state.ideas.filter((item) => item.topicId === a.id)).toEqual([]);
  expect(state.suggestions.filter((item) => item.topicId === a.id)).toEqual([]);
  await card(a.id);
  expect((await call('DELETE', `/ideas/${a.id}`)).status).toBe(204);
  state = await snapshot();
  expect(state.ideas.map((item) => item.id)).toEqual(expect.arrayContaining([b.id, other.id]));
  expect(state.ideas.some((item) => item.id === a.id || item.topicId === a.id)).toBe(false);
});

it('clearing ideas preserves completed research preparation and does not restart it automatically', async () => {
  const a = await topic();
  const prepared = await runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id });
  expect(prepared.find((item) => item.title === 'Topic research status')?.proposal).toContain('not configured');
  const strategy = prepared.find((item) => item.kind === 'idea')!;
  const saved = await call<Suggestion>('POST', `/suggestions/${strategy.id}/approve`, {});
  expect(saved.status).toBe(200);
  await card(a.id);
  await call('POST', `/ideas/${a.id}/clear-ideas`, {});
  web.mockClear();
  expect(await runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id })).toEqual([]);
  expect(web).not.toHaveBeenCalled();
  expect((await snapshot()).ideas.some((item) => item.theme === 'Strategy' && item.topicId === a.id)).toBe(true);
});

it('requires inbox ideas to choose a topic and binds the approved suggestion to that board', async () => {
  const draft = await createSuggestion('hackathon', {
    kind: 'idea',
    title: 'Chat idea',
    reason: 'Conversation',
    ideaDraft: { title: 'Share a calendar', description: 'A team calendar.', theme: 'Option' },
  });
  expect((await call('POST', `/suggestions/${draft.id}/approve`, {})).status).toBe(409);
  const a = await topic();
  await topic('Another topic');
  expect((await call('POST', `/suggestions/${draft.id}/approve`, {})).status).toBe(409);
  const approved = await call<Suggestion>('POST', `/suggestions/${draft.id}/approve`, { topicId: a.id });
  expect(approved.body.topicId).toBe(a.id);
  expect((await snapshot()).ideas.find((item) => item.sourceSuggestionId === draft.id)?.topicId).toBe(a.id);
});

it('explicit approval of an existing topic change clears its board and preserves the approval record', async () => {
  const a = await topic();
  const original = await card(a.id);
  const b = await topic('Other board');
  const other = await card(b.id);
  const draft = await createSuggestion('hackathon', {
    kind: 'brainstorm_topic',
    title: 'Change topic',
    reason: 'Changed direction',
    ideaId: a.id,
    ideaDraft: { title: 'A different direction', description: 'New constraints', theme: 'Option' },
  });
  expect((await call('POST', `/suggestions/${draft.id}/approve`, {})).status).toBe(409);
  expect((await call('POST', `/suggestions/${draft.id}/approve`, { replaceTopicId: b.id })).status).toBe(409);
  expect((await snapshot()).ideas.map((idea) => idea.id)).toEqual(expect.arrayContaining([original.id, other.id]));
  const approved = await call<Suggestion>('POST', `/suggestions/${draft.id}/approve`, { replaceTopicId: a.id });
  expect(approved.status).toBe(200);
  expect(approved.body.status).toBe('approved');
  const state = await snapshot();
  expect(state.ideas.find((item) => item.id === a.id)?.title).toBe('A different direction');
  expect(state.ideas.filter((item) => item.topicId === a.id)).toEqual([]);
  expect(state.ideas.find((item) => item.id === other.id)).toEqual(other);
});

it.each(['all', 'ideas', 'delete'] as const)(
  'rejects explicit meeting suggestions if the topic resets (%s) immediately before storage',
  async (mode) => {
    const a = await topic();
    const originalQuery = queries.queryOne;
    const intercept = vi.spyOn(queries, 'queryOne').mockImplementationOnce(async (...args) => {
      await resetTopic('hackathon', a.id, mode);
      return originalQuery(...args);
    });
    try {
      await expect(
        createSuggestion('hackathon', {
          topicId: a.id,
          topicVersion: a.boardVersion,
          kind: 'idea',
          title: 'Stale meeting idea',
          reason: 'Old context',
          ideaDraft: { title: 'Old draft', description: '', theme: 'Option' },
        }),
      ).rejects.toThrow(/topic changed/i);
    } finally {
      intercept.mockRestore();
    }
    expect((await snapshot()).suggestions).toEqual([]);
  },
);

it('rejects a meeting suggestion whose captured topic version is already stale', async () => {
  const a = await topic();
  await resetTopic('hackathon', a.id, 'all');
  await expect(
    createSuggestion('hackathon', {
      topicId: a.id,
      topicVersion: a.boardVersion,
      kind: 'idea',
      title: 'Outdated draft',
      reason: 'Old context',
    }),
  ).rejects.toThrow(/topic changed/i);
  expect((await snapshot()).suggestions).toEqual([]);
});

it('coalesces simultaneous topic preparation requests', async () => {
  const a = await topic();
  const [first, second] = await Promise.all([
    runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id }),
    runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id }),
  ]);
  expect(web).toHaveBeenCalledTimes(1);
  expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
});

it('searches topic studies from the last four years only', async () => {
  const a = await topic();
  await runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id });
  const since = new Date();
  since.setFullYear(since.getFullYear() - 4);
  expect(web).toHaveBeenCalledWith(expect.stringContaining('survey statistics study'), since.toISOString().slice(0, 10));
});

it.each(['edit', 'delete', 'ideas'] as const)('does not restore stale AI content after %s', async (action) => {
  const a = await topic();
  let release!: (value: Awaited<ReturnType<typeof researchWeb>>) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  web.mockImplementationOnce(() => {
    started();
    return new Promise((resolve) => {
      release = resolve;
    });
  });
  const pending = runBrainstormAction('hackathon', { trigger: 'problem_created', topicId: a.id });
  const rejected = expect(pending).rejects.toThrow(/topic/i);
  await ready;
  if (action === 'delete') await call('DELETE', `/ideas/${a.id}`);
  else if (action === 'edit') await call('PATCH', `/ideas/${a.id}`, { title: 'Changed topic' });
  else await call('POST', `/ideas/${a.id}/clear-ideas`, {});
  release({ configured: true, error: null, results: [] });
  await rejected;
  expect((await snapshot()).suggestions.filter((item) => item.topicId === a.id)).toEqual([]);
});

it('keeps existing boards in a legacy topic and does not reassign new inbox drafts on restart', async () => {
  await getDb()
    .query(
      'UPDATE project:hackathon SET brainstormTopicsMigrated = false; CREATE idea:legacy CONTENT { projectId: project:hackathon, title: "Earlier idea", theme: "Product", authorId: member:alex };',
    )
    .collect();
  await migrateLegacyTopics();
  const state = await snapshot();
  const parent = state.ideas.find((item) => item.kind === 'problem')!;
  expect(state.ideas.find((item) => item.id === 'legacy')?.topicId).toBe(parent.id);
  const inbox = await createSuggestion('hackathon', { kind: 'idea', title: 'Choose a topic later', reason: 'Chat draft' });
  await migrateLegacyTopics();
  expect((await snapshot()).suggestions.find((item) => item.id === inbox.id)?.topicId).toBeNull();
  expect(await getDb().select(rid('idea', 'legacy'))).toBeTruthy();
});
