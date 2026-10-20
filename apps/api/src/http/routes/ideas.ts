import { Router } from 'express';
import { ideaCreateSchema } from '@project-room/shared';
import { ConflictError } from '../../db/records.js';
import { createIdea, getIdea, linkIdeaToTask, listIdeas, toggleVote } from '../../repositories/ideas.js';
import { createTask } from '../../repositories/tasks.js';
import { ctx } from '../context.js';

export const ideasRouter = Router({ mergeParams: true });

ideasRouter.get('/', async (_req, res) => {
  res.json(await listIdeas(ctx(res).project.id));
});

ideasRouter.post('/', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.status(201).json(await createIdea(project.id, memberId, ideaCreateSchema.parse(req.body)));
});

ideasRouter.post('/:ideaId/vote', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await toggleVote(project.id, req.params.ideaId, memberId));
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
