import { Router } from 'express';
import { taskCreateSchema, taskUpdateSchema } from '@project-room/shared';
import { createTask, deleteTask, listTasks, updateTask } from '../../repositories/tasks.js';
import { ctx } from '../context.js';

export const tasksRouter = Router({ mergeParams: true });

tasksRouter.get('/', async (_req, res) => {
  res.json(await listTasks(ctx(res).project.id));
});

tasksRouter.post('/', async (req, res) => {
  const { project, members } = ctx(res);
  const input = taskCreateSchema.parse(req.body);
  if (input.assigneeId && !members.has(input.assigneeId)) {
    res.status(400).json({ error: 'Assignee is not a member of this project' });
    return;
  }
  res.status(201).json(await createTask(project.id, input));
});

tasksRouter.patch('/:taskId', async (req, res) => {
  const { project, members } = ctx(res);
  const patch = taskUpdateSchema.parse(req.body);
  if (patch.assigneeId && !members.has(patch.assigneeId)) {
    res.status(400).json({ error: 'Assignee is not a member of this project' });
    return;
  }
  res.json(await updateTask(project.id, req.params.taskId, patch));
});

tasksRouter.delete('/:taskId', async (req, res) => {
  await deleteTask(ctx(res).project.id, req.params.taskId);
  res.status(204).end();
});
