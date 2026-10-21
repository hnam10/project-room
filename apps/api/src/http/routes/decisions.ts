import { Router } from 'express';
import { decisionCreateSchema, decisionDecideSchema, memoryQuestionSchema } from '@project-room/shared';
import { createDecision, listDecisions, markDecided } from '../../repositories/decisions.js';
import { askProject } from '../../services/memory.js';
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
  const details = decisionDecideSchema.parse(req.body ?? {});
  res.json(await markDecided(project.id, req.params.decisionId, memberId, details));
});

/** "Why did we pick X?" Answered from approved decisions only, never from the chat log. */
decisionsRouter.post('/ask', async (req, res) => {
  const { project, members } = ctx(res);
  const { question } = memoryQuestionSchema.parse(req.body);
  res.json(await askProject(project.id, question, [...members.values()]));
});
