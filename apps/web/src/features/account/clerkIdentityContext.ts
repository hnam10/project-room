import { createContext, useContext } from 'react';

export interface ClerkIdentity {
  name: string;
  imageUrl: string | null;
}

export const IdentityContext = createContext<Map<string, ClerkIdentity>>(new Map());

export function useClerkIdentity(id: string | null | undefined): ClerkIdentity | null {
  const identities = useContext(IdentityContext);
  return id ? (identities.get(id) ?? null) : null;
}
