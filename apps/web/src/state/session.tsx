import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { api, type Me } from '../api/client';

// Who is using the app: the signed-in Clerk user (rendered only inside Clerk's signed-in gate, see main.tsx).

interface Session {
  memberId: string;
  me: Me | null;
  error: string | null;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { userId, orgId } = useAuth();
  // /me returns the active organization's project, so refetch when the user switches teams.
  const { me, error } = useMe(`${userId}:${orgId}`);
  return <SessionContext.Provider value={{ memberId: userId ?? '', me, error }}>{children}</SessionContext.Provider>;
}

/** Loads /me again whenever `key` changes. */
function useMe(key: string) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((result) => {
        if (cancelled) return;
        setMe(result);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return { me, error };
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
