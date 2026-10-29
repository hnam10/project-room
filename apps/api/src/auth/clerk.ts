import { createClerkClient, type ClerkClient } from '@clerk/express';
import { config } from '../config.js';
import {
  addProjectMember,
  ensureProject,
  getMember,
  getProject,
  setMemberName,
  setProjectName,
  upsertMember,
} from '../repositories/projects.js';

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

// Clerk is asked again only after this, so a rename shows up quickly without a profile call on every request.
const IDENTITY_REFRESH_MS = 30_000;
const memberSyncedAt = new Map<string, number>();
const orgSyncedAt = new Map<string, number>();

/** Drops the refresh timers. Tests use this so one case does not count as a recent sync for the next. */
export function resetClerkSyncCache(): void {
  memberSyncedAt.clear();
  orgSyncedAt.clear();
}

function recentlySynced(cache: Map<string, number>, id: string): boolean {
  const at = cache.get(id);
  return at !== undefined && Date.now() - at < IDENTITY_REFRESH_MS;
}

function clerkUserName(user: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
}): string {
  const named = user.fullName?.trim() || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.username?.trim();
  return named || user.primaryEmailAddress?.emailAddress.split('@')[0] || 'Member';
}

/** Makes sure the Clerk user has a member row, and refreshes the name when Clerk's profile changes. */
export async function ensureClerkMember(userId: string): Promise<void> {
  const existing = await getMember(userId);
  if (existing && recentlySynced(memberSyncedAt, userId)) return;
  try {
    const user = await clerk().users.getUser(userId);
    const name = clerkUserName(user);
    memberSyncedAt.set(userId, Date.now());
    if (!existing) await upsertMember({ id: userId, name, color: colorFor(userId), role: '' });
    else if (existing.name !== name && name !== 'Member') await setMemberName(userId, name);
  } catch (error) {
    if (!existing) throw error;
    memberSyncedAt.set(userId, Date.now());
    console.error('Clerk profile refresh failed', error);
  }
}

/**
 * Uses organization membership names to find member rows that may need a profile refresh.
 * Public membership data can lag the profile, so verify differences against the current
 * profile before changing a stored name, even after the refresh window expires.
 */
async function syncMembershipNames(orgId: string): Promise<void> {
  const list = await clerk().organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100 });
  await Promise.all(
    list.data.map(async (membership) => {
      const profile = membership.publicUserData;
      const userId = profile?.userId;
      const name = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim();
      if (!userId || !name || recentlySynced(memberSyncedAt, userId)) return;
      const existing = await getMember(userId);
      if (existing && existing.name !== name) await ensureClerkMember(userId);
    }),
  );
}

/** Makes sure the organization has a project and that the user is in its member list. */
export async function ensureOrgProject(orgId: string, userId: string): Promise<void> {
  let project = await getProject(orgId);
  if (!project || !recentlySynced(orgSyncedAt, orgId)) {
    try {
      const org = await clerk().organizations.getOrganization({ organizationId: orgId });
      const name = org.name.trim();
      if (!project) {
        if (!name) throw new Error('Clerk organization has no name');
        await ensureProject({ id: orgId, name });
        project = await getProject(orgId);
      } else if (name && project.name !== name) {
        await setProjectName(orgId, name);
      }
      await syncMembershipNames(orgId);
      orgSyncedAt.set(orgId, Date.now());
    } catch (error) {
      if (!project) throw error;
      orgSyncedAt.set(orgId, Date.now());
      console.error('Clerk organization refresh failed', error);
    }
  }
  if (project && !project.memberIds.includes(userId)) await addProjectMember(orgId, userId);
}

function colorFor(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return MEMBER_COLORS[hash % MEMBER_COLORS.length]!;
}
