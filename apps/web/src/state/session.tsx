import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { api, type Me } from '../api/client';
import { clerkEnabled, setDevMember } from '../api/auth';
import { readStored, writeStored } from './storage';

// Who is using the app. With Clerk, it's the signed-in user (rendered only inside Clerk's signed-in
// gate, see main.tsx). In dev mode the member is picked in the sidebar ("Acting as").

const MEMBER_KEY = 'project-room-member';

interface Session {
  memberId: string;
  me: Me | null;
  error: string | null;
  /** Dev mode only: act as another member. */
  switchMember: (memberId: string) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  return clerkEnabled ? <ClerkSession>{children}</ClerkSession> : <DevSession>{children}</DevSession>;
}

function ClerkSession({ children }: { children: ReactNode }) {
  const { userId, orgId } = useAuth();
  // /me returns the active organization's project, so refetch when the user switches teams.
  const { me, error } = useMe(`${userId}:${orgId}`);
  return (
    <SessionContext.Provider value={{ memberId: userId ?? '', me, error, switchMember: () => undefined }}>
      {children}
    </SessionContext.Provider>
  );
}

function DevSession({ children }: { children: ReactNode }) {
  const [memberId, setMemberId] = useState(() => readStored(MEMBER_KEY, 'alex'));
  setDevMember(memberId);
  const { me, error } = useMe(memberId);

  const switchMember = useCallback((id: string) => {
    writeStored(MEMBER_KEY, id);
    setDevMember(id);
    setMemberId(id);
  }, []);

  return <SessionContext.Provider value={{ memberId, me, error, switchMember }}>{children}</SessionContext.Provider>;
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
