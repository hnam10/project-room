import { useMemo, type ReactNode } from 'react';
import { useOrganization, useUser } from '@clerk/react';
import { IdentityContext, type ClerkIdentity } from './clerkIdentityContext';

function personName(person: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string {
  return person.fullName?.trim() || [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.username?.trim() || '';
}

/** Makes Clerk's current names and profile photos available to every member avatar. */
export function ClerkIdentityProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { memberships } = useOrganization({ memberships: { pageSize: 100 } });
  const identities = useMemo(() => {
    const result = new Map<string, ClerkIdentity>();
    for (const membership of memberships?.data ?? []) {
      const profile = membership.publicUserData;
      if (!profile?.userId) continue;
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || profile.identifier;
      if (!name) continue;
      result.set(profile.userId, { name, imageUrl: profile.imageUrl });
    }
    // The signed-in profile is fresher than the membership list, which can still show the previous name.
    if (user) {
      const name = personName(user) || result.get(user.id)?.name;
      if (name) result.set(user.id, { name, imageUrl: user.imageUrl });
    }
    return result;
  }, [memberships?.data, user]);
  return <IdentityContext.Provider value={identities}>{children}</IdentityContext.Provider>;
}
