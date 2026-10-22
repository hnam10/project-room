import { Router } from 'express';
import { meetingCreateSchema, transcriptLineCreateSchema, type MeetingDetail } from '@project-room/shared';
import { config } from '../../config.js';
import { getMeeting, listMeetings } from '../../repositories/meetings.js';
import { listPolls } from '../../repositories/polls.js';
import { listLines } from '../../repositories/transcripts.js';
import { addLine, endMeeting, joinMeeting, leaveMeeting, startMeeting } from '../../services/meetings.js';
import { ctx } from '../context.js';

export const meetingsRouter = Router({ mergeParams: true });

meetingsRouter.post('/', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.status(201).json(await startMeeting(project.id, memberId, meetingCreateSchema.parse(req.body)));
});

meetingsRouter.get('/', async (_req, res) => {
  res.json(await listMeetings(ctx(res).project.id));
});

// Declared before /:id so it isn't read as a meeting id.
meetingsRouter.get('/rtc-config', (_req, res) => {
  res.json({ iceServers: config.rtcIceServers });
});

meetingsRouter.get('/:id', async (req, res) => {
  const { project } = ctx(res);
  const [meeting, lines, polls] = await Promise.all([
    getMeeting(project.id, req.params.id),
    listLines(project.id, req.params.id),
    listPolls(project.id, req.params.id),
  ]);
  res.json({ meeting, lines, polls } satisfies MeetingDetail);
});

meetingsRouter.post('/:id/join', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await joinMeeting(project.id, req.params.id, memberId));
});

meetingsRouter.post('/:id/leave', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await leaveMeeting(project.id, req.params.id, memberId));
});

meetingsRouter.post('/:id/lines', async (req, res) => {
  const { project, memberId } = ctx(res);
  const { text } = transcriptLineCreateSchema.parse(req.body);
  res.status(201).json(await addLine(project.id, req.params.id, memberId, text));
});

meetingsRouter.post('/:id/end', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await endMeeting(project.id, req.params.id, memberId));
});
