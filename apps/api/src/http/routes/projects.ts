import { Router } from 'express';
import type { WorkspaceSnapshot } from '@project-room/shared';
import { getAiProvider } from '../../ai/index.js';
import { listDecisions } from '../../repositories/decisions.js';
import { listIdeas } from '../../repositories/ideas.js';
import { getMember, listChannels, listProjectsForMember } from '../../repositories/projects.js';
import { listSuggestions } from '../../repositories/suggestions.js';
import { listTasks } from '../../repositories/tasks.js';
import { ctx, currentMemberId } from '../context.js';

export const meRouter = Router();

meRouter.get('/me', async (req, res) => {
  const memberId = currentMemberId(req);
  const [member, projects] = await Promise.all([getMember(memberId), listProjectsForMember(memberId)]);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  res.json({ member, projects, ai: { provider: getAiProvider().name, isMock: getAiProvider().isMock } });
});

/** Mounted under /api/projects/:projectId (after requireProjectMember). */
export const projectRouter = Router({ mergeParams: true });

projectRouter.get('/snapshot', async (_req, res) => {
  const { project, members } = ctx(res);
  const [channels, tasks, ideas, decisions, suggestions] = await Promise.all([
    listChannels(project.id),
    listTasks(project.id),
    listIdeas(project.id),
    listDecisions(project.id),
    listSuggestions(project.id),
  ]);
  const snapshot: WorkspaceSnapshot = { project, members: [...members.values()], channels, tasks, ideas, decisions, suggestions };
  res.json(snapshot);
});
