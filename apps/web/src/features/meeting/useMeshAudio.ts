import { useCallback, useEffect, useRef, useState } from 'react';
import type { RtcSignal, ServerRtc } from '@project-room/shared';
import { createMeshAudio, type PeerState } from './meshAudio';

export type { PeerState } from './meshAudio';

interface Opts {
  enabled: boolean;
  meetingId: string | undefined;
  me: string;
  participantIds: string[];
  iceServers: RTCIceServer[];
  sendSignal: (to: string, signal: RtcSignal) => void;
  onSignal: (fn: (msg: ServerRtc) => void) => () => void;
  configurationReady: boolean;
  signalingReady: boolean;
  muted: boolean;
}

/** A single microphone for transcription and peer audio; muting never rebuilds the transport. */
export function useMeshAudio({
  enabled,
  meetingId,
  me,
  participantIds,
  iceServers,
  sendSignal,
  onSignal,
  configurationReady,
  signalingReady,
  muted,
}: Opts) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState(false);
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const latest = useRef(sendSignal);
  useEffect(() => {
    latest.current = sendSignal;
  });
  const controller = useRef<ReturnType<typeof createMeshAudio> | null>(null);
  const incoming = useRef<ServerRtc[]>([]);

  // Listen before the microphone prompt resolves, so early offers/candidates are not lost.
  useEffect(() => {
    if (!enabled || !meetingId) return;
    const off = onSignal((message) => {
      if (message.meetingId !== meetingId || message.from === me) return;
      if (controller.current) controller.current.receive(message);
      else if (incoming.current.length < 256) incoming.current.push(message);
    });
    return () => {
      off();
      incoming.current = [];
    };
  }, [enabled, meetingId, me, onSignal]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    const ask =
      navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) ??
      Promise.reject(new Error('no mediaDevices'));
    ask
      .then((value) => {
        if (cancelled) return value.getTracks().forEach((track) => track.stop());
        stream = value;
        setLocalStream(value);
      })
      .catch(() => !cancelled && setMicError(true))
      .finally(() => !cancelled && setMicReady(true));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      setMicReady(false);
      setMicError(false);
    };
  }, [enabled, meetingId]);

  useEffect(() => {
    localStream?.getAudioTracks().forEach((track) => (track.enabled = !muted));
  }, [localStream, muted]);

  useEffect(() => {
    if (!enabled || !micReady || !configurationReady || !meetingId) return;
    const transport = createMeshAudio({
      me,
      meetingId,
      iceServers,
      localStream,
      sendSignal: (to, signal) => latest.current(to, signal),
      onState: (id, state) => setPeers((current) => new Map(current).set(id, state)),
      onStream: (id, stream) => setRemoteStreams((current) => new Map(current).set(id, stream)),
      onRemove: (id) => {
        setPeers((current) => {
          const next = new Map(current);
          next.delete(id);
          return next;
        });
        setRemoteStreams((current) => {
          const next = new Map(current);
          next.delete(id);
          return next;
        });
      },
    });
    controller.current = transport;
    transport.sync(participantIds);
    for (const message of incoming.current.splice(0)) transport.receive(message);
    return () => {
      controller.current = null;
      transport.close();
    };
    // Membership updates use sync below; they must not replace healthy peer connections.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- participantIds is synchronized separately
  }, [enabled, micReady, configurationReady, meetingId, me, localStream, iceServers]);

  const idsKey = participantIds.join(',');
  useEffect(() => {
    controller.current?.sync(idsKey ? idsKey.split(',') : []);
  }, [idsKey, enabled, micReady, configurationReady, meetingId, me, localStream, iceServers]);
  useEffect(() => {
    if (signalingReady) controller.current?.signalingRestored();
  }, [signalingReady]);
  const retryAudio = useCallback(() => controller.current?.signalingRestored(), []);
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('online', retryAudio);
    return () => window.removeEventListener('online', retryAudio);
  }, [enabled, retryAudio]);
  return { peers, localStream, remoteStreams, micError, retryAudio };
}
