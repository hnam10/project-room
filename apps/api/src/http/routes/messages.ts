import { Router } from 'express';
import { messageCreateSchema } from '@project-room/shared';
import { getFile } from '../../repositories/files.js';
import { createMessage, listMessages } from '../../repositories/messages.js';
import { getChannel } from '../../repositories/projects.js';
import { onMessagePosted } from '../../services/ai-engine.js';
import { ctx } from '../context.js';

export const messagesRouter = Router({ mergeParams: true });

messagesRouter.get('/:channelId/messages', async (req, res) => {
  const { project } = ctx(res);
  const channel = await getChannel(project.id, req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  res.json(await listMessages(project.id, channel.id));
});

messagesRouter.post('/:channelId/messages', async (req, res) => {
  const { project, memberId, members } = ctx(res);
  const channel = await getChannel(project.id, req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  const { text, fileId } = messageCreateSchema.parse(req.body);
  if (fileId) await getFile(project.id, fileId);
  const message = await createMessage({ projectId: project.id, channelId: channel.id, authorId: memberId, text, fileId });
  res.status(201).json(message);

  // The AI reacts after the response; its output reaches clients through realtime events.
  onMessagePosted({ projectId: project.id, channelName: channel.name, message, members }).catch((error) =>
    console.error('AI engine failed for message', message.id, error),
  );
});
