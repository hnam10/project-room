import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setApiMember, type Me } from '../api/client';
import { readStored, writeStored } from './storage';

// Who is using the app. DEV ONLY: there is no login yet; the member is picked in the sidebar
// and sent to the API as a header. Replace with real auth before sharing a deployment.

const MEMBER_KEY = 'project-room-member';

interface Session {
  memberId: string;
  me: Me | null;
  error: string | null;
  switchMember: (memberId: string) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [memberId, setMemberId] = useState(() => readStored(MEMBER_KEY, 'alex'));
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  setApiMember(memberId);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((result) => !cancelled && setMe(result))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const switchMember = useCallback((id: string) => {
    writeStored(MEMBER_KEY, id);
    setApiMember(id);
    setError(null);
    setMemberId(id);
  }, []);

  return <SessionContext.Provider value={{ memberId, me, error, switchMember }}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
