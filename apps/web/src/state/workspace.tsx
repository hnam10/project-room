import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import type { Member, Message, Project, RealtimeEvent, RealtimeTable, WorkspaceSnapshot } from '@project-room/shared';
import { api } from '../api/client';
import { useRealtime, type ConnectionState } from '../api/realtime';
import { useSession } from './session';

// One project's data, kept in sync with the server: loaded once as a snapshot, then patched
// by realtime events and by the records our own API calls return (both are idempotent upserts).

type CollectionTable = 'task' | 'idea' | 'decision' | 'suggestion';
const COLLECTION: Record<CollectionTable, 'tasks' | 'ideas' | 'decisions' | 'suggestions'> = {
  task: 'tasks',
  idea: 'ideas',
  decision: 'decisions',
  suggestion: 'suggestions',
};

interface State {
  snapshot: WorkspaceSnapshot | null;
  messages: Record<string, Message[] | undefined>;
  error: string | null;
}

type Action =
  | { type: 'loaded'; snapshot: WorkspaceSnapshot }
  | { type: 'failed'; error: string }
  | { type: 'messagesLoaded'; channelId: string; messages: Message[] }
  | { type: 'project'; project: Project }
  | { type: 'change'; event: Pick<RealtimeEvent, 'table' | 'action' | 'record'> };

function upsert<T extends { id: string }>(list: T[], record: T, remove: boolean): T[] {
  const without = list.filter((item) => item.id !== record.id);
  if (remove) return without;
  const index = list.findIndex((item) => item.id === record.id);
  if (index === -1) return [...list, record];
  const copy = [...list];
  copy[index] = record;
  return copy;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return { ...state, snapshot: action.snapshot, error: null };
    case 'failed':
      return { ...state, error: action.error };
    case 'messagesLoaded':
      return { ...state, messages: { ...state.messages, [action.channelId]: action.messages } };
    case 'project':
      if (!state.snapshot) return state;
      return { ...state, snapshot: { ...state.snapshot, project: action.project } };
    case 'change': {
      const { table, action: kind, record } = action.event;
      if (table === 'message') {
        const message = record as Message;
        const current = state.messages[message.channelId];
        if (!current) return state; // not loaded yet; it will arrive with the next fetch
        const next = upsert(current, message, kind === 'delete').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return { ...state, messages: { ...state.messages, [message.channelId]: next } };
      }
      if (!state.snapshot) return state;
      // meeting, transcript_line and poll events are not part of the snapshot
      const key = COLLECTION[table as CollectionTable] as (typeof COLLECTION)[CollectionTable] | undefined;
      if (!key) return state;
      const list = state.snapshot[key] as { id: string }[];
      return { ...state, snapshot: { ...state.snapshot, [key]: upsert(list, record as { id: string }, kind === 'delete') } };
    }
  }
}

interface Workspace {
  projectId: string;
  snapshot: WorkspaceSnapshot | null;
  error: string | null;
  connection: ConnectionState;
  members: Map<string, Member>;
  messages: (channelId: string) => Message[] | undefined;
  loadMessages: (channelId: string) => Promise<void>;
  activeChannelId: string | null;
  setActiveChannelId: (channelId: string) => void;
  /** Applies a record returned by an API call without waiting for the realtime echo. */
  applyRecord: (table: RealtimeTable, record: { id: string }, removed?: boolean) => void;
  /** Replaces the project on the snapshot. The project table is not a realtime stream. */
  applyProject: (project: Project) => void;
  reload: () => void;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const { memberId } = useSession();
  const [state, dispatch] = useReducer(reducer, { snapshot: null, messages: {}, error: null });
  const [chosenChannelId, setActiveChannelId] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .snapshot(projectId)
      .then((snapshot) => dispatch({ type: 'loaded', snapshot }))
      .catch((e: Error) => dispatch({ type: 'failed', error: e.message }));
  }, [projectId]);

  useEffect(reload, [reload, memberId]);

  const loadMessages = useCallback(
    async (channelId: string) => {
      const messages = await api.messages(projectId, channelId);
      dispatch({ type: 'messagesLoaded', channelId, messages });
    },
    [projectId],
  );

  const connection = useRealtime(
    projectId,
    memberId,
    (event) => dispatch({ type: 'change', event }),
    () => {
      reload();
      for (const channelId of Object.keys(state.messages)) void loadMessages(channelId);
    },
  );

  // Default to #general (or the first channel) until a valid channel is chosen.
  const channels = state.snapshot?.channels;
  const activeChannelId =
    channels?.find((c) => c.id === chosenChannelId)?.id ?? (channels?.find((c) => c.name === 'general') ?? channels?.[0])?.id ?? null;

  const value = useMemo<Workspace>(
    () => ({
      projectId,
      snapshot: state.snapshot,
      error: state.error,
      connection,
      members: new Map((state.snapshot?.members ?? []).map((m) => [m.id, m])),
      messages: (channelId) => state.messages[channelId],
      loadMessages,
      activeChannelId,
      setActiveChannelId,
      applyRecord: (table, record, removed = false) =>
        dispatch({ type: 'change', event: { table, action: removed ? 'delete' : 'update', record } as RealtimeEvent }),
      applyProject: (project) => dispatch({ type: 'project', project }),
      reload,
    }),
    [projectId, state, connection, loadMessages, activeChannelId, reload],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}

/** The loaded snapshot; only use below a component that renders after loading. */
export function useSnapshot(): WorkspaceSnapshot {
  const { snapshot } = useWorkspace();
  if (!snapshot) throw new Error('Workspace snapshot not loaded yet');
  return snapshot;
}
