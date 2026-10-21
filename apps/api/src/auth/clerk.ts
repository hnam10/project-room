import { createClerkClient, type ClerkClient } from '@clerk/express';
import { config } from '../config.js';
import { addProjectMember, ensureProject, getMember, getProject, upsertMember } from '../repositories/projects.js';

// Clerk is the source of identity when its keys are set (see config.authMode):
//   Clerk user         -> member   (same id, e.g. "user_2ab…")
//   Clerk organization -> project  (same id, e.g. "org_2cd…")
// Rows are created on first use instead of via webhooks, so no public URL is needed in development.

const MEMBER_COLORS = ['#5b4ff0', '#0e9f6e', '#e07a1f', '#d6409f', '#2f80ed', '#c2410c', '#0891b2', '#7c3aed'];

let client: ClerkClient | null = null;

export function clerk(): ClerkClient {
  client ??= createClerkClient({ secretKey: config.clerkSecretKey!, publishableKey: config.clerkPublishableKey! });
  return client;
}

/** Who a Clerk session token belongs to, and which organization (project) it is scoped to. */
export interface ClerkCaller {
  userId: string;
  orgId: string | null;
}

/** Verifies a bare session token (the WebSocket can't send headers, so it passes the token in the URL). */
export async function verifySessionToken(token: string): Promise<ClerkCaller | null> {
  const request = new Request('http://localhost/ws', { headers: { authorization: `Bearer ${token}` } });
  const auth = (await clerk().authenticateRequest(request)).toAuth();
  return auth?.userId ? { userId: auth.userId, orgId: auth.orgId ?? null } : null;
}

/** Makes sure the Clerk user has a member row, copying their name from Clerk the first time. */
export async function ensureClerkMember(userId: string): Promise<void> {
  if (await getMember(userId)) return;
  const user = await clerk().users.getUser(userId);
  const name = user.fullName || user.username || user.primaryEmailAddress?.emailAddress.split('@')[0] || 'Member';
  await upsertMember({ id: userId, name, color: colorFor(userId), role: '' });
}

/** Makes sure the organization has a project and that the user is in its member list. */
export async function ensureOrgProject(orgId: string, userId: string): Promise<void> {
  let project = await getProject(orgId);
  if (!project) {
    const org = await clerk().organizations.getOrganization({ organizationId: orgId });
    await ensureProject({ id: orgId, name: org.name });
    project = await getProject(orgId);
  }
  if (project && !project.memberIds.includes(userId)) await addProjectMember(orgId, userId);
}

function colorFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return MEMBER_COLORS[hash % MEMBER_COLORS.length]!;
}
