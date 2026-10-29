import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ClientRtc, RealtimeEvent, ServerMessage, ServerRtc } from '@project-room/shared';
import { socketAuthQuery } from './auth';

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
  onSignal?: (msg: ServerRtc) => void,
  /** Filled with a function that sends a WebRTC signal on the open socket (false if it isn't open). */
  sendRef?: RefObject<((msg: ClientRtc) => boolean) | null>,
): { connection: ConnectionState; online: string[] } {
  const [state, setState] = useState<ConnectionState>('connecting');
  /** Member ids with this project open right now. */
  const [online, setOnline] = useState<string[]>([]);
  const handlers = useRef({ onEvent, onReconnect, onSignal });
  useLayoutEffect(() => {
    handlers.current = { onEvent, onReconnect, onSignal };
  });

  useEffect(() => {
    if (!projectId) return;
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: number | undefined;
    let closed = false;
    let wasOnline = false;

    const connect = async () => {
      setState('connecting');
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const auth = await socketAuthQuery(projectId).catch(() => '');
      if (closed) return;
      socket = new WebSocket(`${scheme}://${location.host}/ws?${auth}`);
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
        } else if (msg.type === 'presence') {
          setOnline(msg.memberIds);
        } else if (msg.type === 'rtc') {
          handlers.current.onSignal?.(msg);
        }
      };
      socket.onclose = () => {
        if (closed) return;
        setState('offline');
        timer = window.setTimeout(() => void connect(), Math.min(1000 * 2 ** retry++, 15000));
      };
    };

    if (sendRef)
      sendRef.current = (msg) => {
        if (socket?.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(msg));
        return true;
      };
    void connect();
    return () => {
      closed = true;
      if (sendRef) sendRef.current = null;
      window.clearTimeout(timer);
      socket?.close();
    };
  }, [projectId, memberId, sendRef]);

  return { connection: state, online };
}
