import { getToken } from '@clerk/react';

// How the web app proves who it is to the API: every call carries a Clerk session token. Project calls
// ask for a token scoped to that project's organization, so the API can check membership from the token.
// There is no anonymous mode; without a Clerk key the app shows a setup screen instead (see main.tsx).

export const clerkPublishableKey: string | null = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || null;

/** Headers that identify the caller; pass the project id for calls under /projects/:id. */
export async function authHeaders(projectId?: string): Promise<Record<string, string>> {
  const token = await getToken(projectId ? { organizationId: projectId } : undefined);
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Query string for the realtime socket (browsers can't set headers on a WebSocket). */
export async function socketAuthQuery(projectId: string): Promise<string> {
  const token = await getToken({ organizationId: projectId });
  return `token=${encodeURIComponent(token ?? '')}`;
}
