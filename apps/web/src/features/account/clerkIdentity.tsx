import { useMemo, type ReactNode } from 'react';
import { useOrganization, useUser } from '@clerk/react';
import { IdentityContext, type ClerkIdentity } from './clerkIdentityContext';

/** Makes Clerk's current names and profile photos available to every member avatar. */
export function ClerkIdentityProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { memberships } = useOrganization({ memberships: { pageSize: 100 } });
  const identities = useMemo(() => {
    const result = new Map<string, ClerkIdentity>();
    if (user) result.set(user.id, { name: user.fullName || user.username || 'Member', imageUrl: user.imageUrl });
    for (const membership of memberships?.data ?? []) {
      const profile = membership.publicUserData;
      if (!profile?.userId) continue;
      result.set(profile.userId, {
        name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.identifier || 'Member',
        imageUrl: profile.imageUrl,
      });
    }
    return result;
  }, [memberships?.data, user]);
  return <IdentityContext.Provider value={identities}>{children}</IdentityContext.Provider>;
}
