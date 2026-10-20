import { Router } from 'express';
import { decisionCreateSchema } from '@project-room/shared';
import { createDecision, listDecisions, markDecided } from '../../repositories/decisions.js';
import { ctx } from '../context.js';

export const decisionsRouter = Router({ mergeParams: true });

decisionsRouter.get('/', async (_req, res) => {
  res.json(await listDecisions(ctx(res).project.id));
});

decisionsRouter.post('/', async (req, res) => {
  const { project, memberId } = ctx(res);
  const { title } = decisionCreateSchema.parse(req.body);
  res.status(201).json(await createDecision(project.id, memberId, title));
});

decisionsRouter.post('/:decisionId/decide', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await markDecided(project.id, req.params.decisionId, memberId));
});
