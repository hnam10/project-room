import { useOrganization } from '@clerk/react';
import { createContext, useContext } from 'react';

export interface ClerkIdentity {
  name: string;
  imageUrl: string | null;
}

export const IdentityContext = createContext<Map<string, ClerkIdentity>>(new Map());

export function useClerkIdentities(): Map<string, ClerkIdentity> {
  return useContext(IdentityContext);
}

export function useClerkIdentity(id: string | null | undefined): ClerkIdentity | null {
  const identities = useClerkIdentities();
  return id ? (identities.get(id) ?? null) : null;
}

/** The Clerk organization's current name when this project is that organization. */
export function useClerkProjectName(project: { id: string; name: string }): string {
  const { organization } = useOrganization();
  const live = organization?.id === project.id ? organization.name.trim() : '';
  return live || project.name;
}

/** Clerk's current name for this person, then the name stored on the member row. */
export function memberDisplayName(
  identities: Map<string, ClerkIdentity>,
  id: string,
  stored?: string | null,
  fallback = 'Former member',
): string {
  return identities.get(id)?.name || stored || fallback;
}
