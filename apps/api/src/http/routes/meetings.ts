import express, { Router } from 'express';
import { meetingAiSchema, meetingCreateSchema, transcriptLineCreateSchema, type MeetingDetail } from '@project-room/shared';
import { ForbiddenError } from '../../db/records.js';
import { config } from '../../config.js';
import { getMeeting, listMeetings, setAiEnabled } from '../../repositories/meetings.js';
import { listPolls } from '../../repositories/polls.js';
import { listLines } from '../../repositories/transcripts.js';
import { serverTranscription } from '../../ai/transcribe.js';
import { addAudio, addLine, endMeeting, joinMeeting, leaveMeeting, startMeeting } from '../../services/meetings.js';
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
  res.json({ iceServers: config.rtcIceServers, transcription: serverTranscription() ? 'server' : 'browser' });
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
  const { text, source } = transcriptLineCreateSchema.parse(req.body);
  res.status(201).json(await addLine(project.id, req.params.id, memberId, text, source));
});

// A few seconds of the caller's mic (webm/ogg/mp4), transcribed on the server. 204 when it was silent.
meetingsRouter.post('/:id/audio', express.raw({ type: 'audio/*', limit: '2mb' }), async (req, res) => {
  const { project, memberId } = ctx(res);
  const type = req.headers['content-type'] ?? '';
  if (!serverTranscription()) return void res.status(501).json({ error: 'Server transcription is not configured' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return void res.status(400).json({ error: 'Send an audio/* clip as the body' });
  const line = await addAudio(project.id, req.params.id, memberId, req.body, type);
  if (line) res.status(201).json(line);
  else res.status(204).end();
});

meetingsRouter.post('/:id/end', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await endMeeting(project.id, req.params.id, memberId));
});

meetingsRouter.post('/:id/ai', async (req, res) => {
  const { project, memberId } = ctx(res);
  const { enabled } = meetingAiSchema.parse(req.body);
  const meeting = await getMeeting(project.id, req.params.id);
  if (!meeting.participantIds.includes(memberId)) throw new ForbiddenError('Join the meeting to change the AI');
  res.json(await setAiEnabled(meeting.id, enabled));
});
