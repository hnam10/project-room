import { Router } from 'express';
import { projectUpdateSchema, type WorkspaceSnapshot } from '@project-room/shared';
import { getAiProvider } from '../../ai/index.js';
import { listFiles } from '../../repositories/files.js';
import { listIdeas } from '../../repositories/ideas.js';
import { listProjectPolls } from '../../repositories/polls.js';
import { getMember, listChannels, listProjectsForMember, updateProject } from '../../repositories/projects.js';
import { listSuggestions } from '../../repositories/suggestions.js';
import { listTasks } from '../../repositories/tasks.js';
import { authMode } from '../../config.js';
import { caller, ctx, projectForCaller } from '../context.js';

export const meRouter = Router();

meRouter.get('/me', async (_req, res) => {
  const { memberId, orgId } = caller(res);
  // With Clerk, the projects a user can open are their Clerk organizations; the web app lists those
  // with Clerk's switcher, so only the active one is returned here.
  let projects = authMode === 'dev' ? await listProjectsForMember(memberId) : [];
  const active = orgId ? await projectForCaller(caller(res), orgId) : null;
  if (active) projects = [active];
  const member = await getMember(memberId);
  if (!member) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  res.json({ member, projects, auth: authMode, ai: { provider: getAiProvider().name, isMock: getAiProvider().isMock } });
});

/** Mounted under /api/projects/:projectId (after requireProjectMember). */
export const projectRouter = Router({ mergeParams: true });

projectRouter.patch('/', async (req, res) => {
  res.json(await updateProject(ctx(res).project.id, projectUpdateSchema.parse(req.body)));
});

projectRouter.get('/snapshot', async (_req, res) => {
  const { project, members } = ctx(res);
  const [channels, tasks, ideas, polls, suggestions, files] = await Promise.all([
    listChannels(project.id),
    listTasks(project.id),
    listIdeas(project.id),
    listProjectPolls(project.id),
    listSuggestions(project.id),
    listFiles(project.id),
  ]);
  const snapshot: WorkspaceSnapshot = {
    project,
    members: [...members.values()],
    channels,
    tasks,
    ideas,
    polls,
    suggestions,
    files,
  };
  res.json(snapshot);
});
