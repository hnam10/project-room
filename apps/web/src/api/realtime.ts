import { useEffect, useRef, useState } from 'react';
import type { RealtimeEvent, ServerMessage } from '@project-room/shared';

export type ConnectionState = 'connecting' | 'online' | 'offline';

/**
 * Subscribes to live changes for a project over /ws and reconnects with backoff.
 * `onReconnect` fires after a dropped connection comes back, so callers can refetch
 * anything they may have missed while offline.
 */
export function useRealtime(
  projectId: string | undefined,
  memberId: string,
  onEvent: (event: RealtimeEvent) => void,
  onReconnect?: () => void,
): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');
  const handlers = useRef({ onEvent, onReconnect });
  handlers.current = { onEvent, onReconnect };

  useEffect(() => {
    if (!projectId) return;
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: number | undefined;
    let closed = false;
    let wasOnline = false;

    const connect = () => {
      setState('connecting');
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${scheme}://${location.host}/ws?member=${encodeURIComponent(memberId)}`);
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'subscribe', projectId }));
      socket.onmessage = (raw) => {
        const msg = JSON.parse(String(raw.data)) as ServerMessage;
        if (msg.type === 'ready') {
          setState('online');
          if (wasOnline) handlers.current.onReconnect?.();
          wasOnline = true;
          retry = 0;
        } else {
          handlers.current.onEvent(msg);
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setState('offline');
        timer = window.setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000));
      };
    };

    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [projectId, memberId]);

  return state;
}
