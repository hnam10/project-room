import { useEffect, useRef, useState } from 'react';
import type { RtcSignal, ServerRtc } from '@project-room/shared';

export type PeerState = 'connecting' | 'connected' | 'failed';

interface Opts {
  enabled: boolean;
  meetingId: string | undefined;
  me: string;
  participantIds: string[];
  iceServers: RTCIceServer[];
  sendSignal: (to: string, signal: RtcSignal) => void;
  onSignal: (fn: (msg: ServerRtc) => void) => () => void;
  muted: boolean;
}

const CONNECT_TIMEOUT_MS = 10_000;

/**
 * Full-mesh audio: one RTCPeerConnection per other participant, negotiated with the
 * standard "perfect negotiation" pattern (the lower id is polite). Signals travel through
 * the server's rtc relay.
 */
export function useMeshAudio({ enabled, meetingId, me, participantIds, iceServers, sendSignal, onSignal, muted }: Opts) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState(false);
  const [peers, setPeers] = useState<Map<string, PeerState>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const latest = useRef({ sendSignal, me });
  useEffect(() => {
    latest.current = { sendSignal, me };
  });
  const sync = useRef<((ids: string[]) => void) | null>(null);

  // One microphone stream for the whole meeting.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    const ask =
      navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) ??
      Promise.reject(new Error('no mediaDevices'));
    ask
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        setLocalStream(s);
      })
      .catch(() => !cancelled && setMicError(true))
      .finally(() => !cancelled && setMicReady(true));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      setMicReady(false);
      setMicError(false);
    };
  }, [enabled, meetingId]);

  useEffect(() => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [localStream, muted]);

  // Peer connections.
  useEffect(() => {
    if (!enabled || !micReady || !meetingId) return;
    interface Peer {
      pc: RTCPeerConnection;
      polite: boolean;
      makingOffer: boolean;
      ignoreOffer: boolean;
      pending: RTCIceCandidateInit[];
      chain: Promise<void>;
      timer: number;
      closed: boolean;
    }
    const pcs = new Map<string, Peer>();
    const listed = new Set<string>(); // ids we have seen in participantIds (only those are closed on absence)
    const send = (to: string, signal: RtcSignal) => latest.current.sendSignal(to, signal);
    const setPeer = (id: string, s: PeerState) => setPeers((m) => new Map(m).set(id, s));

    const ensure = (id: string): Peer => {
      const existing = pcs.get(id);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers });
      const peer: Peer = {
        pc,
        polite: latest.current.me < id,
        makingOffer: false,
        ignoreOffer: false,
        pending: [],
        chain: Promise.resolve(),
        closed: false,
        timer: window.setTimeout(() => {
          if (pc.connectionState !== 'connected') broken(id);
        }, CONNECT_TIMEOUT_MS),
      };
      pcs.set(id, peer);
      setPeer(id, 'connecting');
      if (localStream) localStream.getAudioTracks().forEach((t) => pc.addTrack(t, localStream));
      else pc.addTransceiver('audio', { direction: 'recvonly' }); // no mic: still hear others
      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        setRemoteStreams((m) => new Map(m).set(id, stream));
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) send(id, { kind: 'ice', data: e.candidate.toJSON() });
      };
      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          send(id, { kind: 'offer', data: pc.localDescription?.toJSON() });
        } catch {
          // connection closed mid-negotiation
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === 'connected') setPeer(id, 'connected');
        else if (s === 'failed') broken(id);
        else if (s === 'connecting' || s === 'new') setPeer(id, 'connecting');
      };
      return peer;
    };

    const close = (id: string) => {
      const peer = pcs.get(id);
      if (!peer) return;
      peer.closed = true;
      window.clearTimeout(peer.timer);
      peer.pc.onnegotiationneeded = peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.onconnectionstatechange = null;
      peer.pc.close();
      pcs.delete(id);
      listed.delete(id);
      setPeers((m) => (m.delete(id) ? new Map(m) : m));
      setRemoteStreams((m) => (m.delete(id) ? new Map(m) : m));
    };

    // A failed or stuck connection: unlisted (ghost) peers are dropped; listed ones are rebuilt, at most 3 times a minute.
    const rebuilds = new Map<string, number[]>();
    function broken(id: string) {
      if (!listed.has(id)) return close(id);
      const now = Date.now();
      const recent = (rebuilds.get(id) ?? []).filter((t) => now - t < 60_000);
      if (recent.length >= 3) return setPeer(id, 'failed');
      rebuilds.set(id, [...recent, now]);
      close(id);
      listed.add(id);
      ensure(id);
    }

    const handle = async (id: string, peer: Peer, signal: RtcSignal) => {
      if (peer.closed || pcs.get(id) !== peer) return; // closed while queued: never rebuild here
      const { pc } = peer;
      try {
        if (signal.kind === 'ice') {
          if (pc.remoteDescription) await pc.addIceCandidate(signal.data as RTCIceCandidateInit).catch(() => {});
          else peer.pending.push(signal.data as RTCIceCandidateInit); // relay may deliver before the offer
          return;
        }
        const description = signal.data as RTCSessionDescriptionInit;
        if (signal.kind === 'offer') {
          const collision = peer.makingOffer || pc.signalingState !== 'stable';
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
        }
        await pc.setRemoteDescription(description); // polite peer rolls back its own offer implicitly
        for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (signal.kind === 'offer') {
          await pc.setLocalDescription();
          send(id, { kind: 'answer', data: pc.localDescription?.toJSON() });
        }
      } catch {
        // stale answer, closed connection, or an ignored offer's leftovers
      }
    };

    const off = onSignal((msg) => {
      if (msg.meetingId !== meetingId || msg.from === latest.current.me) return;
      const peer = ensure(msg.from);
      peer.chain = peer.chain.then(() => handle(msg.from, peer, msg.signal));
    });
    sync.current = (ids) => {
      const want = new Set(ids.filter((id) => id !== latest.current.me));
      for (const id of want) {
        listed.add(id);
        ensure(id);
      }
      for (const id of [...pcs.keys()]) if (!want.has(id) && listed.has(id)) close(id);
    };
    sync.current(participantIds);

    return () => {
      off();
      sync.current = null;
      for (const id of [...pcs.keys()]) close(id);
    };
    // participantIds is applied by the sync effect below; re-creating every connection when it changes would drop calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [enabled, micReady, meetingId, localStream, iceServers, onSignal]);

  const idsKey = participantIds.join(',');
  useEffect(() => {
    sync.current?.(idsKey ? idsKey.split(',') : []);
  }, [idsKey, enabled, micReady, meetingId, localStream, iceServers, onSignal]);

  return { peers, localStream, remoteStreams, micError };
}
