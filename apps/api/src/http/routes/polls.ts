import { Router } from 'express';
import { pollVoteSchema } from '@project-room/shared';
import { NotFoundError } from '../../db/records.js';
import { closePoll, votePoll } from '../../repositories/polls.js';
import { ctx } from '../context.js';

export const pollsRouter = Router({ mergeParams: true });

pollsRouter.post('/:pollId/vote', async (req, res) => {
  const { project, memberId } = ctx(res);
  const { optionId } = pollVoteSchema.parse(req.body);
  try {
    res.json(await votePoll(project.id, req.params.pollId, memberId, optionId));
  } catch (error) {
    // An unknown option is a bad request; a missing poll stays 404.
    if (error instanceof NotFoundError && error.message.startsWith('Option')) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

pollsRouter.post('/:pollId/close', async (req, res) => {
  res.json(await closePoll(ctx(res).project.id, req.params.pollId));
});
