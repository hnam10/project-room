import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RealtimeEvent, ServerMessage } from '@project-room/shared';
import { apiBaseUrl, tunnelHeaders } from '../config';
import { socketAuthQuery } from './auth';

export type ConnectionState = 'connecting' | 'online' | 'offline';

function wsBaseUrl(): string {
  const http = apiBaseUrl();
  if (http.startsWith('https://')) return `wss://${http.slice('https://'.length)}`;
  if (http.startsWith('http://')) return `ws://${http.slice('http://'.length)}`;
  return `ws://${http}`;
}

export function useRealtime(
  projectId: string | undefined,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void,
): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');
  const handlers = useRef({ onEvent, onReconnect });
  useLayoutEffect(() => {
    handlers.current = { onEvent, onReconnect };
  });

  useEffect(() => {
    if (!projectId) return;
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    let wasOnline = false;

    const connect = async () => {
      setState('connecting');
      const auth = await socketAuthQuery(projectId).catch(() => '');
      if (closed) return;
      // React Native accepts a headers option. The DOM type only lists url and protocols.
      const Socket = WebSocket as unknown as new (
        url: string,
        protocols: undefined,
        options: { headers: Record<string, string> },
      ) => WebSocket;
      socket = new Socket(`${wsBaseUrl()}/ws?${auth}`, undefined, { headers: tunnelHeaders() });
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'subscribe', projectId }));
      socket.onmessage = (raw) => {
        const msg = JSON.parse(String(raw.data)) as ServerMessage;
        if (msg.type === 'ready') {
          setState('online');
          if (wasOnline) handlers.current.onReconnect?.();
          wasOnline = true;
          retry = 0;
        } else if (msg.type === 'change') {
          handlers.current.onEvent(msg);
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setState('offline');
        timer = setTimeout(() => void connect(), Math.min(1000 * 2 ** retry++, 15000));
      };
    };

    void connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [projectId]);

  return state;
}
