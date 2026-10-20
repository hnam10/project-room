import type { NextFunction, Request, Response } from 'express';
import type { Member, Project } from '@project-room/shared';
import { getProject, listMembers } from '../repositories/projects.js';

// Who is calling, and which project they're acting in.
//
// DEV ONLY: there is no authentication yet. The caller is identified by the `x-member-id`
// header (the web app sends the member picked in the UI). Replace currentMemberId() with real
// session/token auth before deploying anywhere shared.

export const DEV_DEFAULT_MEMBER = 'alex';

export interface ProjectContext {
  project: Project;
  memberId: string;
  members: Map<string, Member>;
}

export function currentMemberId(req: Request): string {
  const header = req.header('x-member-id');
  return header && /^[a-z0-9_-]{1,64}$/i.test(header) ? header : DEV_DEFAULT_MEMBER;
}

/** Loads :projectId and rejects callers who aren't members, so no route can read another team's data. */
export async function requireProjectMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  const projectId = String(req.params.projectId);
  const project = await getProject(projectId);
  const memberId = currentMemberId(req);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  if (!project.memberIds.includes(memberId)) {
    res.status(403).json({ error: 'You are not a member of this project' });
    return;
  }
  const members = await listMembers(project.memberIds);
  res.locals.ctx = { project, memberId, members: new Map(members.map((m) => [m.id, m])) } satisfies ProjectContext;
  next();
}

export function ctx(res: Response): ProjectContext {
  return res.locals.ctx as ProjectContext;
}
