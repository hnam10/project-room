import type { NextFunction, Request, Response } from 'express';
import { getAuth } from '@clerk/express';
import type { Member, Project } from '@project-room/shared';
import { ensureClerkMember, ensureOrgProject } from '../auth/clerk.js';
import { authMode } from '../config.js';
import { getProject, listMembers } from '../repositories/projects.js';

// Who is calling, and which project they're acting in.
//
// Clerk mode (CLERK_* keys set): the caller is the signed-in Clerk user, and a session token only
// opens the project of the organization it is scoped to.
// Dev mode (no keys): the caller is identified by the `x-member-id` header (the member picked in
// the UI's "Acting as"). Anyone can act as anyone, so never deploy dev mode anywhere shared.

export const DEV_DEFAULT_MEMBER = 'alex';

export interface Caller {
  memberId: string;
  /** Clerk mode: the organization (= project) the session is scoped to. Always null in dev mode. */
  orgId: string | null;
}

export interface ProjectContext {
  project: Project;
  memberId: string;
  members: Map<string, Member>;
}

export function devMemberId(value: string | null | undefined): string {
  return value && /^[a-z0-9_-]{1,64}$/i.test(value) ? value : DEV_DEFAULT_MEMBER;
}

/** Identifies the caller for every /api route (after clerkMiddleware in Clerk mode). */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (authMode === 'dev') {
    res.locals.caller = { memberId: devMemberId(req.header('x-member-id')), orgId: null } satisfies Caller;
    next();
    return;
  }
  const { userId, orgId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: 'Sign in to continue' });
    return;
  }
  await ensureClerkMember(userId);
  res.locals.caller = { memberId: userId, orgId: orgId ?? null } satisfies Caller;
  next();
}

export function caller(res: Response): Caller {
  return res.locals.caller as Caller;
}

/** The project if the caller may open it, otherwise null. Shared by HTTP routes and the WebSocket. */
export async function projectForCaller({ memberId, orgId }: Caller, projectId: string): Promise<Project | null> {
  if (authMode === 'clerk') {
    // Membership comes from Clerk: the token must be scoped to this project's organization.
    if (orgId !== projectId) return null;
    await ensureOrgProject(orgId, memberId);
  }
  const project = await getProject(projectId);
  return project?.memberIds.includes(memberId) ? project : null;
}

/** Loads :projectId and rejects callers who aren't members, so no route can read another team's data. */
export async function requireProjectMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  const projectId = String(req.params.projectId);
  const { memberId } = caller(res);
  const project = await projectForCaller(caller(res), projectId);
  if (!project) {
    const exists = authMode === 'dev' && (await getProject(projectId));
    res.status(exists ? 403 : 404).json({ error: exists ? 'You are not a member of this project' : 'Project not found' });
    return;
  }
  const members = await listMembers(project.memberIds);
  res.locals.ctx = { project, memberId, members: new Map(members.map((m) => [m.id, m])) } satisfies ProjectContext;
  next();
}

export function ctx(res: Response): ProjectContext {
  return res.locals.ctx as ProjectContext;
}
