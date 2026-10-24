import { Router } from 'express';
import { brainstormActionSchema, ideaCreateSchema, ideaUpdateSchema } from '@project-room/shared';
import { z } from 'zod';
import { ConflictError } from '../../db/records.js';
import {
  approveSelectedIdea,
  createIdea,
  getIdea,
  linkIdeaToTask,
  listIdeas,
  setIdeaShortlisted,
  startIdeaVote,
  toggleVote,
  updateIdea,
} from '../../repositories/ideas.js';
import { createTask } from '../../repositories/tasks.js';
import { runBrainstormAction } from '../../services/brainstorm.js';
import { isSignificantIdeaChange } from '../../services/idea-change.js';
import { removeIdea } from '../../services/idea-deletion.js';
import { ctx } from '../context.js';

export const ideasRouter = Router({ mergeParams: true });

ideasRouter.get('/', async (_req, res) => {
  res.json(await listIdeas(ctx(res).project.id));
});

ideasRouter.post('/', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.status(201).json(await createIdea(project.id, memberId, ideaCreateSchema.parse(req.body)));
});

ideasRouter.post('/actions', async (req, res) => {
  const { project } = ctx(res);
  res.status(201).json(await runBrainstormAction(project.id, brainstormActionSchema.parse(req.body)));
});

ideasRouter.patch('/:ideaId', async (req, res) => {
  const { project } = ctx(res);
  const patch = ideaUpdateSchema.parse(req.body);
  const previous = await getIdea(project.id, req.params.ideaId);
  res.json(await updateIdea(project.id, previous.id, patch, isSignificantIdeaChange(previous, patch)));
});

ideasRouter.delete('/:ideaId', async (req, res) => {
  const { project, memberId } = ctx(res);
  await removeIdea(project.id, req.params.ideaId, memberId);
  res.status(204).end();
});

ideasRouter.post('/:ideaId/shortlist', async (req, res) => {
  const { project } = ctx(res);
  const { shortlisted } = z.object({ shortlisted: z.boolean() }).parse(req.body);
  res.json(await setIdeaShortlisted(project.id, req.params.ideaId, shortlisted));
});

ideasRouter.post('/:ideaId/approve', async (req, res) => {
  const { project } = ctx(res);
  res.json(await approveSelectedIdea(project.id, req.params.ideaId));
});

ideasRouter.post('/:ideaId/vote', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await toggleVote(project.id, req.params.ideaId, memberId));
});

ideasRouter.post('/:ideaId/start-vote', async (req, res) => {
  const { project } = ctx(res);
  res.json(await startIdeaVote(project.id, req.params.ideaId));
});

/** Turns an idea into an unassigned To Do task and links the two. */
ideasRouter.post('/:ideaId/convert', async (req, res) => {
  const { project } = ctx(res);
  const idea = await getIdea(project.id, req.params.ideaId);
  if (idea.taskId) throw new ConflictError('This idea is already on the board');
  const task = await createTask(
    project.id,
    { title: idea.title, status: 'todo', priority: 'medium', label: 'feature', assigneeId: null, dueDate: null },
    { kind: 'idea', id: idea.id },
  );
  res.status(201).json({ idea: await linkIdeaToTask(idea.id, task.id), task });
});
