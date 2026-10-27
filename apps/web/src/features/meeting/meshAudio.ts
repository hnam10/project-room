import type { RtcSignal, ServerRtc } from '@project-room/shared';

export type PeerState = 'connecting' | 'connected' | 'failed';
const CONNECT_TIMEOUT_MS = 10_000;
const DISCONNECT_GRACE_MS = 3_000;

interface Peer {
  pc: RTCPeerConnection;
  polite: boolean;
  ignoreOffer: boolean;
  pending: RTCIceCandidateInit[];
  chain: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  recovering: boolean;
  attempts: number[];
  closed: boolean;
}

interface Options {
  me: string;
  meetingId: string;
  iceServers: RTCIceServer[];
  localStream: MediaStream | null;
  sendSignal: (to: string, signal: RtcSignal) => void;
  onState: (id: string, state: PeerState) => void;
  onStream: (id: string, stream: MediaStream) => void;
  onRemove: (id: string) => void;
}

/** Meeting-scoped transport. Local negotiation and incoming signals share a per-peer queue. */
export function createMeshAudio(options: Options) {
  const peers = new Map<string, Peer>();
  let members = new Set<string>();
  let stopped = false;
  const active = (id: string, peer: Peer) => !stopped && !peer.closed && peers.get(id) === peer;
  const clearTimer = (peer: Peer) => {
    if (peer.timer !== null) clearTimeout(peer.timer);
    peer.timer = null;
  };
  const arm = (id: string, peer: Peer, delay = CONNECT_TIMEOUT_MS) => {
    clearTimer(peer);
    peer.timer = setTimeout(() => {
      peer.timer = null;
      recover(id, peer);
    }, delay);
  };
  const enqueue = (id: string, peer: Peer, action: () => Promise<void>) => {
    peer.chain = peer.chain
      .then(async () => {
        if (active(id, peer)) await action();
      })
      .catch(() => {
        // Stale descriptions/candidates must not poison the queue or prevent timed recovery.
        if (active(id, peer) && peer.timer === null) arm(id, peer);
      });
  };
  const sendDescription = (id: string, peer: Peer) => {
    const description = peer.pc.localDescription;
    if (active(id, peer) && description)
      options.sendSignal(id, { kind: description.type === 'answer' ? 'answer' : 'offer', data: description.toJSON() });
  };
  const close = (id: string) => {
    const peer = peers.get(id);
    if (!peer) return;
    peer.closed = true;
    clearTimer(peer);
    peer.pc.onnegotiationneeded =
      peer.pc.onicecandidate =
      peer.pc.ontrack =
      peer.pc.onconnectionstatechange =
      peer.pc.oniceconnectionstatechange =
        null;
    peer.pc.close();
    peers.delete(id);
    options.onRemove(id);
  };

  function recover(id: string, peer: Peer) {
    if (!active(id, peer)) return;
    if (!members.has(id)) return close(id);
    const { pc } = peer;
    if (pc.connectionState === 'connected' && !['disconnected', 'failed'].includes(pc.iceConnectionState)) return;
    const now = Date.now();
    peer.attempts = peer.attempts.filter((time) => now - time < 60_000);
    if (peer.attempts.length >= 3) {
      options.onState(id, 'failed');
      return;
    }
    peer.attempts.push(now);
    peer.recovering = true;
    options.onState(id, 'connecting');
    arm(id, peer);
    enqueue(id, peer, async () => {
      // A slow microphone prompt or dropped socket can lose the original offer. Resend it
      // (including gathered ICE) rather than replacing only one side of the connection.
      if (pc.signalingState === 'have-local-offer') sendDescription(id, peer);
      else pc.restartIce();
    });
  }

  function ensure(id: string): Peer {
    const existing = peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: options.iceServers });
    const peer: Peer = {
      pc,
      polite: options.me < id,
      ignoreOffer: false,
      pending: [],
      chain: Promise.resolve(),
      timer: null,
      recovering: false,
      attempts: [],
      closed: false,
    };
    peers.set(id, peer);
    options.onState(id, 'connecting');
    pc.onnegotiationneeded = () =>
      enqueue(id, peer, async () => {
        await pc.setLocalDescription();
        sendDescription(id, peer);
      });
    pc.onicecandidate = (event) => {
      if (active(id, peer) && event.candidate) options.sendSignal(id, { kind: 'ice', data: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      if (active(id, peer)) options.onStream(id, event.streams[0] ?? new MediaStream([event.track]));
    };
    const stateChanged = () => {
      if (!active(id, peer)) return;
      if (pc.connectionState === 'connected' && !['disconnected', 'failed'].includes(pc.iceConnectionState)) {
        clearTimer(peer);
        peer.recovering = false;
        options.onState(id, 'connected');
      } else if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') {
        if (!peer.recovering) recover(id, peer);
      } else {
        options.onState(id, 'connecting');
        if ((pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected') && peer.timer === null)
          arm(id, peer, DISCONNECT_GRACE_MS);
      }
    };
    pc.onconnectionstatechange = pc.oniceconnectionstatechange = stateChanged;
    if (options.localStream) options.localStream.getAudioTracks().forEach((track) => pc.addTrack(track, options.localStream!));
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    arm(id, peer);
    return peer;
  }

  const receive = (message: ServerRtc) => {
    if (stopped || message.meetingId !== options.meetingId || message.from === options.me) return;
    const id = message.from;
    const peer = ensure(id);
    enqueue(id, peer, async () => {
      const { pc } = peer;
      const signal = message.signal;
      if (signal.kind === 'ice') {
        if (peer.ignoreOffer) return; // ignore the rejected offer's ICE candidates too
        if (!pc.remoteDescription) {
          if (peer.pending.length < 256) peer.pending.push(signal.data as RTCIceCandidateInit);
        } else await pc.addIceCandidate(signal.data as RTCIceCandidateInit).catch(() => {});
        return;
      }
      const description = signal.data as RTCSessionDescriptionInit;
      const collision = signal.kind === 'offer' && pc.signalingState !== 'stable';
      peer.ignoreOffer = collision && !peer.polite;
      if (peer.ignoreOffer) {
        peer.pending = [];
        return;
      }
      // Serialization prevents a new offer racing an unfinished remote-answer application.
      await pc.setRemoteDescription(description);
      if (!active(id, peer)) return;
      for (const candidate of peer.pending.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
      if (signal.kind === 'offer') {
        await pc.setLocalDescription();
        sendDescription(id, peer);
      }
    });
  };

  return {
    receive,
    sync(ids: string[]) {
      if (stopped) return;
      const previous = members;
      members = new Set(ids.filter((id) => id !== options.me));
      for (const id of members) ensure(id);
      for (const id of previous) if (!members.has(id)) close(id);
    },
    signalingRestored() {
      for (const [id, peer] of peers) {
        if (peer.pc.connectionState === 'connected' && !['disconnected', 'failed'].includes(peer.pc.iceConnectionState)) continue;
        peer.attempts = [];
        recover(id, peer);
      }
    },
    close() {
      stopped = true;
      for (const id of [...peers.keys()]) close(id);
    },
  };
}
