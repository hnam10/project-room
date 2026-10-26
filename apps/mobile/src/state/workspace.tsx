import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Channel, Member, Message, RealtimeEvent, RealtimeTable, WorkspaceSnapshot } from '@project-room/shared';
import { api } from '../api/client';
import { useRealtime, type ConnectionState } from '../api/realtime';

type CollectionTable = 'task' | 'channel' | 'idea' | 'poll' | 'suggestion' | 'file';
const COLLECTION: Record<
  CollectionTable,
  keyof Pick<WorkspaceSnapshot, 'tasks' | 'channels' | 'ideas' | 'polls' | 'suggestions' | 'files'>
> = {
  task: 'tasks',
  channel: 'channels',
  idea: 'ideas',
  poll: 'polls',
  suggestion: 'suggestions',
  file: 'files',
};

interface Thread {
  messages: Message[];
  loaded: boolean;
  error: string | null;
}

interface State {
  snapshot: WorkspaceSnapshot | null;
  threads: Record<string, Thread | undefined>;
  error: string | null;
}

type Action =
  | { type: 'loaded'; snapshot: WorkspaceSnapshot }
  | { type: 'failed'; error: string }
  | { type: 'messagesLoaded'; channelId: string; messages: Message[] }
  | { type: 'messagesFailed'; channelId: string; error: string }
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

function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function mergeMessages(fetched: Message[], existing: Message[]): Message[] {
  const byId = new Map(fetched.map((message) => [message.id, message]));
  for (const message of existing) {
    if (!byId.has(message.id)) byId.set(message.id, message);
  }
  return sortMessages([...byId.values()]);
}

function pickChannelId(channels: Channel[], current: string | null): string | null {
  if (current && channels.some((channel) => channel.id === current)) return current;
  return (channels.find((channel) => channel.name === 'general') ?? channels[0])?.id ?? null;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return { ...state, snapshot: action.snapshot, error: null };
    case 'failed':
      return { ...state, error: action.error };
    case 'messagesLoaded': {
      const current = state.threads[action.channelId];
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.channelId]: {
            messages: mergeMessages(action.messages, current?.messages ?? []),
            loaded: true,
            error: null,
          },
        },
      };
    }
    case 'messagesFailed': {
      const current = state.threads[action.channelId];
      return {
        ...state,
        threads: {
          ...state.threads,
          [action.channelId]: {
            messages: current?.messages ?? [],
            loaded: current?.loaded ?? false,
            error: action.error,
          },
        },
      };
    }
    case 'change': {
      const { table, action: kind, record } = action.event;
      if (table === 'message') {
        const message = record as Message;
        const current = state.threads[message.channelId];
        return {
          ...state,
          threads: {
            ...state.threads,
            [message.channelId]: {
              messages: sortMessages(upsert(current?.messages ?? [], message, kind === 'delete')),
              loaded: current?.loaded ?? false,
              error: current?.error ?? null,
            },
          },
        };
      }
      if (!state.snapshot) return state;
      const key = COLLECTION[table as CollectionTable];
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
  thread: (channelId: string) => Thread | undefined;
  loadMessages: (channelId: string) => Promise<void>;
  activeChannelId: string | null;
  setActiveChannelId: (channelId: string) => void;
  applyRecord: (table: RealtimeTable, record: RealtimeEvent['record'], removed?: boolean) => void;
  reload: () => void;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { snapshot: null, threads: {}, error: null });
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const loadSeq = useRef<Record<string, number>>({});

  const reload = useCallback(() => {
    api
      .snapshot(projectId)
      .then((snapshot) => {
        dispatch({ type: 'loaded', snapshot });
        setActiveChannelId((current) => pickChannelId(snapshot.channels, current));
      })
      .catch((e: Error) => dispatch({ type: 'failed', error: e.message }));
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onEvent = useCallback((event: RealtimeEvent) => {
    dispatch({ type: 'change', event });
  }, []);

  const loadMessages = useCallback(
    async (channelId: string) => {
      const seq = (loadSeq.current[channelId] ?? 0) + 1;
      loadSeq.current[channelId] = seq;
      try {
        const messages = await api.messages(projectId, channelId);
        if (loadSeq.current[channelId] !== seq) return;
        dispatch({ type: 'messagesLoaded', channelId, messages });
      } catch (e) {
        if (loadSeq.current[channelId] !== seq) return;
        dispatch({ type: 'messagesFailed', channelId, error: e instanceof Error ? e.message : "Couldn't load messages." });
      }
    },
    [projectId],
  );

  const onReconnect = useCallback(() => {
    reload();
    if (activeChannelId) void loadMessages(activeChannelId);
  }, [reload, activeChannelId, loadMessages]);

  const connection = useRealtime(projectId, onEvent, onReconnect);

  useEffect(() => {
    if (activeChannelId) void loadMessages(activeChannelId);
  }, [activeChannelId, loadMessages]);

  const applyRecord = useCallback((table: RealtimeTable, record: RealtimeEvent['record'], removed = false) => {
    dispatch({ type: 'change', event: { table, action: removed ? 'delete' : 'update', record } });
  }, []);

  const members = useMemo(() => {
    const map = new Map<string, Member>();
    for (const member of state.snapshot?.members ?? []) map.set(member.id, member);
    return map;
  }, [state.snapshot?.members]);

  const value: Workspace = {
    projectId,
    snapshot: state.snapshot,
    error: state.error,
    connection,
    members,
    thread: (channelId) => state.threads[channelId],
    loadMessages,
    activeChannelId,
    setActiveChannelId,
    applyRecord,
    reload,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Workspace {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
