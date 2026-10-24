import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESEARCH_SUMMARY_REASON, hasResearchableDetail, type Idea, type Suggestion, type Task } from '@project-room/shared';
import { createApp } from './app.js';
import { closeDb, connectDb, getDb } from './db/client.js';
import { rid } from './db/records.js';
import { seedDemoData } from './db/seed.js';
import { researchWeb } from './services/research.js';
import { isCopiedResearch, similarWebResults } from './services/brainstorm.js';
import { isSignificantIdeaChange } from './services/idea-change.js';
import { createSuggestion } from './repositories/suggestions.js';

vi.mock('./services/research.js', () => ({ researchWeb: vi.fn() }));

let server: Server;
let base: string;
const web = vi.mocked(researchWeb);
const source = (title: string, url: string, content: string) => ({ title, url, content });

beforeAll(async () => {
  await connectDb('mem://');
  await seedDemoData();
  server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api/projects/hackathon`;
});
beforeEach(() => {
  web.mockReset();
  web.mockResolvedValue({ configured: true, results: [], error: null });
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
});
const call = async <T>(method: string, path: string, body?: unknown) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-member-id': 'alex' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (response.status === 204 ? undefined : await response.json()) as T };
};

describe('sourced brainstorm research', () => {
  let problem: Idea;
  let idea: Idea;

  it('turns a specific central problem into a reviewable direction without generic guidance', async () => {
    const created = await call<Idea>('POST', '/ideas', {
      kind: 'problem',
      title: 'Students miss group deadlines',
      description: 'University teams need a better way to coordinate.',
    });
    expect(created.status).toBe(201);
    problem = created.body;
    expect((await call('POST', '/ideas', { kind: 'problem', title: 'Duplicate' })).status).toBe(409);
    web.mockResolvedValue({
      configured: true,
      results: [
        source(
          'Student group deadline planning app',
          'https://deadlines.example/product',
          'Student groups can coordinate deadlines and assignments in a shared planning app.',
        ),
      ],
      error: null,
    });
    const result = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', ideaId: problem.id });
    expect(result.body).toHaveLength(1);
    expect(result.body[0]).toMatchObject({ kind: 'idea', status: 'pending', brainstormTrigger: 'problem_created' });
    expect(result.body[0]?.ideaDraft?.description).toContain('Students miss group deadlines');
    expect(result.body[0]?.researchSources).toEqual([
      { title: 'Student group deadline planning app', url: 'https://deadlines.example/product' },
    ]);
    expect((await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', ideaId: problem.id })).body).toEqual([]);
    await call('POST', `/suggestions/${result.body[0]!.id}/dismiss`, {});
  });

  it('shows relevant sourced work and only saves its link after member approval', async () => {
    const created = await call<Idea>('POST', '/ideas', {
      title: 'Shared deadline calendar',
      description: 'A calendar for university group assignments',
    });
    idea = created.body;
    const match = source(
      'Student deadline calendar for group projects',
      'https://calendar.example/product',
      'A student deadline calendar helps university groups share assignment due dates and reminders.',
    );
    const unrelated = source(
      'Garden planting planner',
      'https://garden.example/planner',
      'Plan your garden beds, watering schedule, and seasonal planting dates for better harvests.',
    );
    web.mockResolvedValue({ configured: true, results: [match, unrelated], error: null });
    const research = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'first_idea', ideaId: idea.id });
    expect(research.status).toBe(201);
    const example = research.body.find((suggestion) => suggestion.kind === 'brainstorm_analysis');
    expect(example).toMatchObject({
      title: `Similar work: ${match.title}`,
      status: 'pending',
      researchSources: [{ title: match.title, url: match.url }],
    });
    expect(example?.proposal).toContain('related approach');
    expect(example?.proposal).not.toBe(match.content);
    expect(example?.reason.startsWith(RESEARCH_SUMMARY_REASON)).toBe(true);
    expect((await call<Idea[]>('GET', '/ideas')).body.find((item) => item.id === idea.id)?.researchSources).toEqual([]);
    const saved = await call<Suggestion>('POST', `/suggestions/${example!.id}/approve`, {});
    expect(saved.body.status).toBe('approved');
    expect((await call<Idea[]>('GET', '/ideas')).body.find((item) => item.id === idea.id)?.researchSources).toEqual([
      { title: match.title, url: match.url },
    ]);

    await call('POST', `/ideas/${idea.id}/shortlist`, { shortlisted: true });
    await call('POST', `/ideas/${idea.id}/approve`, {});
    const plan = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'idea_approved', ideaId: idea.id });
    expect(plan.body).toHaveLength(1);
    expect(plan.body[0]?.kind).toBe('action_items');
    expect(plan.body[0]?.status).toBe('pending');
    expect((await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'idea_approved', ideaId: idea.id })).body[0]?.id).toBe(
      plan.body[0]?.id,
    );
  });

  it('can replace an older raw search snippet with a reviewable summary', async () => {
    const old = await createSuggestion('hackathon', {
      kind: 'brainstorm_analysis',
      title: 'Similar work: Student planner',
      proposal: 'A student planner helps university groups share assignment due dates and reminders.',
      reason: 'Found while searching for a student planner.',
      researchSources: [{ title: 'Student planner', url: 'https://planner.example/product' }],
      ideaId: idea.id,
    });
    const updated = await call<Suggestion>('POST', `/suggestions/${old.id}/summarize-research`, {});
    expect(updated.status).toBe(200);
    expect(updated.body.reason.startsWith(RESEARCH_SUMMARY_REASON)).toBe(true);
    expect(updated.body.proposal).not.toBe(old.proposal);
    expect(updated.body.researchSources).toEqual(old.researchSources);
    expect((await call<Suggestion>('POST', `/suggestions/${old.id}/summarize-research`, {})).body.proposal).toBe(updated.body.proposal);
  });

  it('stays quiet for generic triggers, vague ideas, and searches without relevant matches', async () => {
    const vague = await call<Idea>('POST', '/ideas', { title: 'test' });
    expect((await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'first_idea', ideaId: vague.body.id })).body).toEqual([]);
    expect(web).not.toHaveBeenCalled();
    expect((await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'discussion_inactive' })).body).toEqual([]);
    expect((await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'multiple_ideas' })).body).toEqual([]);

    const specific = await call<Idea>('POST', '/ideas', { title: 'Student workload tracker' });
    web.mockResolvedValue({
      configured: true,
      results: [
        source('Garden planning app', 'https://garden.example/app', 'A guide to garden planting, watering, soil, and harvest schedules.'),
      ],
      error: null,
    });
    const noMatch = (await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'first_idea', ideaId: specific.body.id })).body;
    expect(noMatch.every((suggestion) => suggestion.kind === 'idea' && suggestion.researchSources.length === 0)).toBe(true);
    expect(web).toHaveBeenCalledTimes(1);
    expect((await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'first_idea', ideaId: specific.body.id })).body).toEqual([]);
    expect(web).toHaveBeenCalledTimes(1);
    const marker = (await call<Suggestion[]>('GET', '/suggestions')).body.find(
      (item) => item.ideaId === specific.body.id && item.title.startsWith('Research checked:'),
    );
    expect(marker?.status).toBe('dismissed');
  });

  it('rechecks a significantly changed idea without approving it automatically', async () => {
    const typo = await call<Idea>('PATCH', `/ideas/${idea.id}`, { title: 'Shared deadline calender' });
    expect(typo.body.approved).toBe(true);
    const changed = await call<Idea>('PATCH', `/ideas/${idea.id}`, { title: 'Automatic workload assignment' });
    expect(changed.body.approved).toBe(false);
    expect(changed.body.researchStale).toBe(true);
    web.mockResolvedValue({
      configured: true,
      results: [
        source(
          'Automatic workload assignment for student teams',
          'https://workload.example/product',
          'Automatic workload assignment helps student teams distribute tasks by capacity and skill.',
        ),
      ],
      error: null,
    });
    const examples = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'idea_updated', ideaId: idea.id });
    expect(examples.body[0]?.title).toMatch(/^Similar work:/);
    expect(examples.body[0]?.status).toBe('pending');
  });

  it.each(['Shared deadline calender', 'Automatic workload assignment'])(
    'updates an older idea without research sources: %s',
    async (title) => {
      const created = await call<Idea>('POST', '/ideas', { title: 'Shared deadline calendar' });
      // Simulate a record saved before researchSources existed, then restore the current field definition.
      try {
        await getDb().query('DEFINE FIELD OVERWRITE researchSources ON idea TYPE option<array<object>>').collect();
        await getDb()
          .query('UPDATE ONLY $id UNSET researchSources', { id: rid('idea', created.body.id) })
          .collect();
      } finally {
        await getDb().query('DEFINE FIELD OVERWRITE researchSources ON idea TYPE array<object> DEFAULT ALWAYS []').collect();
      }
      expect((await call<Idea[]>('GET', '/ideas')).body.find((item) => item.id === created.body.id)).not.toHaveProperty('researchSources');

      const updated = await call<Idea>('PATCH', `/ideas/${created.body.id}`, { title });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({ title, researchSources: [], researchStale: false });
    },
  );

  it('deletes an idea, dismisses linked examples, and keeps its task', async () => {
    const created = await call<Idea>('POST', '/ideas', { title: 'Collaborative deadline reminder' });
    web.mockResolvedValue({
      configured: true,
      results: [
        source(
          'Collaborative deadline reminder for teams',
          'https://reminder.example/product',
          'A collaborative deadline reminder keeps teams informed of project milestones and upcoming due dates.',
        ),
      ],
      error: null,
    });
    const research = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'first_idea', ideaId: created.body.id });
    const example = research.body.find((suggestion) => suggestion.kind === 'brainstorm_analysis');
    const direction = research.body.find((suggestion) => suggestion.kind === 'idea');
    expect(direction?.originIdeaId).toBe(created.body.id);
    const converted = await call<{ idea: Idea; task: Task }>('POST', `/ideas/${created.body.id}/convert`);
    expect(converted.status).toBe(201);
    expect((await call('DELETE', `/ideas/${created.body.id}`)).status).toBe(204);
    expect((await call<Idea[]>('GET', '/ideas')).body.some((item) => item.id === created.body.id)).toBe(false);
    expect((await call<Suggestion[]>('GET', '/suggestions')).body.find((item) => item.id === example?.id)?.status).toBe('dismissed');
    expect((await call<Suggestion[]>('GET', '/suggestions')).body.find((item) => item.id === direction?.id)?.status).toBe('dismissed');
    expect((await call<Task[]>('GET', '/tasks')).body.some((task) => task.id === converted.body.task.id)).toBe(true);
  });

  it('allows a central problem to be deleted and defined again', async () => {
    expect((await call('DELETE', `/ideas/${problem.id}`)).status).toBe(204);
    const replacement = await call<Idea>('POST', '/ideas', { kind: 'problem', title: 'A clearer central problem' });
    expect(replacement.status).toBe(201);
    expect((await call<Idea[]>('GET', '/ideas')).body.filter((item) => item.kind === 'problem')).toHaveLength(1);
  });

  it('suggests a strategy for a non-product goal without searching the web', async () => {
    const current = (await call<Idea[]>('GET', '/ideas')).body.find((item) => item.kind === 'problem')!;
    await call<Idea>('PATCH', `/ideas/${current.id}`, {
      title: 'Organize a campus food waste awareness event',
      description: 'Help students share practical habits through a workshop and peer activities.',
    });
    const pending = (await call<Suggestion[]>('GET', '/suggestions')).body.filter(
      (suggestion) => suggestion.status === 'pending' && suggestion.title.startsWith('Brainstorm direction:'),
    );
    for (const suggestion of pending) await call('POST', `/suggestions/${suggestion.id}/dismiss`, {});
    web.mockClear();
    const action = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', ideaId: current.id });
    expect(action.status).toBe(201);
    expect(action.body).toHaveLength(1);
    expect(action.body[0]?.ideaDraft?.theme).toBe('Strategy');
    expect(action.body[0]?.ideaDraft?.description).toContain('campus food waste awareness event');
    expect(web).not.toHaveBeenCalled();
    const approved = await call<Suggestion>('POST', `/suggestions/${action.body[0]!.id}/approve`, {});
    expect(approved.body.status).toBe('approved');
    expect(
      (await call<Idea[]>('GET', '/ideas')).body.some(
        (item) => item.theme === 'Strategy' && item.title === action.body[0]?.ideaDraft?.title,
      ),
    ).toBe(true);

    const activity = await call<Idea>('POST', '/ideas', {
      title: 'Put out more videos',
      description: 'Plan more student awareness clips.',
    });
    web.mockClear();
    const followup = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'first_idea', ideaId: activity.body.id });
    expect(followup.body[0]?.ideaDraft?.theme).toBe('Strategy');
    expect(web).not.toHaveBeenCalled();
  });

  it('suggests a direct meal option without web research or follow-up tasks', async () => {
    const current = (await call<Idea[]>('GET', '/ideas')).body.find((item) => item.kind === 'problem')!;
    await call<Idea>('PATCH', `/ideas/${current.id}`, {
      title: 'What should our team eat for dinner?',
      description: 'We want a simple cuisine suggestion for tonight.',
    });
    for (const suggestion of (await call<Suggestion[]>('GET', '/suggestions')).body.filter(
      (item) => item.status === 'pending' && item.kind === 'idea',
    ))
      await call('POST', `/suggestions/${suggestion.id}/dismiss`, {});

    web.mockClear();
    const action = await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'problem_created', ideaId: current.id });
    expect(action.status).toBe(201);
    expect(action.body).toHaveLength(1);
    expect(action.body[0]?.ideaDraft).toMatchObject({ title: 'Italian food', theme: 'Option' });
    expect(web).not.toHaveBeenCalled();

    await call('POST', `/suggestions/${action.body[0]!.id}/approve`, {});
    const option = (await call<Idea[]>('GET', '/ideas')).body.find((item) => item.title === 'Italian food')!;
    await call('POST', `/ideas/${option.id}/shortlist`, { shortlisted: true });
    await call('POST', `/ideas/${option.id}/approve`, {});
    expect((await call<Suggestion[]>('POST', '/ideas/actions', { trigger: 'idea_approved', ideaId: option.id })).body).toEqual([]);
  });
});

it('requires a concrete idea and rejects unrelated web results', () => {
  expect(hasResearchableDetail({ title: 'creating an app', description: '' })).toBe(false);
  expect(hasResearchableDetail({ title: 'Student deadline calendar', description: '' })).toBe(true);
  expect(hasResearchableDetail({ title: '학생 팀 과제 일정 관리', description: '' })).toBe(true);
  expect(
    similarWebResults({ title: 'Student deadline calendar', description: 'Group assignment reminders' } as Idea, [
      source('Student deadline calendar', 'https://example.com/calendar', 'Students share assignment deadlines and calendar reminders.'),
      source('Garden planting planner', 'https://example.com/garden', 'Gardeners plan soil, watering, planting, and harvest dates.'),
    ]).map((result) => result.url),
  ).toEqual(['https://example.com/calendar']);
});

it('classifies simple wording changes conservatively', () => {
  const before = { title: 'AI task management', description: 'Help students manage deadlines' } as Idea;
  expect(isSignificantIdeaChange(before, { title: 'AI task managment' })).toBe(false);
  expect(isSignificantIdeaChange(before, { title: 'Shared calendar for high school teachers' })).toBe(true);
});

it('rejects copied search text in place of a summary', () => {
  const snippet = 'A student planner helps university groups share assignment due dates and reminders.';
  expect(isCopiedResearch(snippet, snippet)).toBe(true);
  expect(isCopiedResearch('This tool organizes deadlines for student groups.', snippet)).toBe(false);
});
