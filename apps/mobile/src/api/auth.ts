type TokenGetter = (options?: { organizationId?: string }) => Promise<string | null>;

let getTokenFn: TokenGetter | null = null;

/** Called once from the signed-in shell so API calls can attach Clerk session tokens. */
export function bindClerkGetToken(getToken: TokenGetter): void {
  getTokenFn = getToken;
}

export function clearClerkGetToken(): void {
  getTokenFn = null;
}

/** Headers that identify the caller; pass the project id for calls under /projects/:id. */
export async function authHeaders(projectId?: string): Promise<Record<string, string>> {
  const token = await getTokenFn?.(projectId ? { organizationId: projectId } : undefined);
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Query string for the realtime socket. */
export async function socketAuthQuery(projectId: string): Promise<string> {
  const token = await getTokenFn?.({ organizationId: projectId });
  return `token=${encodeURIComponent(token ?? '')}`;
}
