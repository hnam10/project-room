import { Router } from 'express';
import { channelCreateSchema } from '@project-room/shared';
import { createChannel } from '../../repositories/projects.js';
import { ctx } from '../context.js';

export const channelsRouter = Router({ mergeParams: true });

channelsRouter.post('/', async (req, res) => {
  const { project } = ctx(res);
  res.status(201).json(await createChannel(project.id, channelCreateSchema.parse(req.body)));
});
