import type { RtcSignal, ServerRtc } from '@project-room/shared';

export type PeerState = 'connecting' | 'connected' | 'failed';
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
interface Peer {
  session: string | null;
  pc: RTCPeerConnection | null;
  connection: string | null;
  retired: Set<string>;
  candidates: Map<string, RTCIceCandidateInit[]>;
  chain: Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  attempts: number[];
  starting: boolean;
}
const TIMEOUT = 12_000;

/** One offerer per pair. Every join and every rebuilt connection has its own identity. */
export function createMeshAudio(options: Options) {
  const session = crypto.randomUUID();
  const peers = new Map<string, Peer>();
  const retiredSessions = new Map<string, Set<string>>();
  let members = new Set<string>();
  let stopped = false;
  const active = (id: string, peer: Peer) => !stopped && peers.get(id) === peer;
  const connected = (peer: Peer) =>
    peer.pc?.connectionState === 'connected' && !['failed', 'disconnected'].includes(peer.pc.iceConnectionState);
  const remember = (set: Set<string>, value: string) => {
    set.add(value);
    if (set.size > 16) set.delete(set.values().next().value!);
  };
  const clearTimer = (peer: Peer) => {
    if (peer.timer) clearTimeout(peer.timer);
    peer.timer = null;
  };
  const arm = (id: string, peer: Peer, delay = TIMEOUT) => {
    clearTimer(peer);
    peer.timer = setTimeout(() => {
      peer.timer = null;
      recover(id, peer);
    }, delay);
  };
  const send = (id: string, peer: Peer, kind: RtcSignal['kind'], data: unknown = null) => {
    if (active(id, peer))
      options.sendSignal(id, {
        kind,
        data,
        sessionId: session,
        targetSessionId: peer.session ?? undefined,
        connectionId: peer.connection ?? undefined,
      });
  };
  const ready = (id: string, peer: Peer, ack = false) => send(id, peer, 'ready', { ack });
  const detach = (id: string, peer: Peer) => {
    clearTimer(peer);
    const pc = peer.pc;
    peer.pc = null;
    if (peer.connection) remember(peer.retired, peer.connection);
    peer.connection = null;
    if (pc) {
      pc.onicecandidate = pc.ontrack = pc.onconnectionstatechange = pc.oniceconnectionstatechange = null;
      pc.close();
      options.onRemove(id);
    }
  };
  const ensure = (id: string): Peer => {
    let peer = peers.get(id);
    if (!peer) {
      peer = {
        session: null,
        pc: null,
        connection: null,
        retired: new Set(),
        candidates: new Map(),
        chain: Promise.resolve(),
        timer: null,
        attempts: [],
        starting: false,
      };
      peers.set(id, peer);
      options.onState(id, 'connecting');
    }
    return peer;
  };
  const adopt = (id: string, remote: string): Peer | null => {
    if (retiredSessions.get(id)?.has(remote)) return null;
    let peer = ensure(id);
    if (peer.session && peer.session !== remote) {
      const retired = retiredSessions.get(id) ?? new Set<string>();
      remember(retired, peer.session);
      retiredSessions.set(id, retired);
      detach(id, peer);
      peers.delete(id);
      peer = ensure(id);
    }
    peer.session = remote;
    return peer;
  };
  const queue = (id: string, peer: Peer, job: () => Promise<void>) => {
    peer.chain = peer.chain
      .then(async () => {
        if (active(id, peer)) await job();
      })
      .catch(() => {
        if (active(id, peer) && !peer.timer) arm(id, peer);
      });
  };
  const build = (id: string, peer: Peer, connection: string) => {
    const early = peer.candidates.get(connection);
    peer.candidates.clear();
    if (early) peer.candidates.set(connection, early);
    detach(id, peer);
    const pc = new RTCPeerConnection({ iceServers: options.iceServers });
    peer.pc = pc;
    peer.connection = connection;
    const current = () => active(id, peer) && peer.pc === pc;
    pc.onicecandidate = (event) => {
      if (current() && event.candidate) send(id, peer, 'ice', event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      if (current()) options.onStream(id, new MediaStream([event.track]));
    };
    const stateChanged = () => {
      if (!current()) return;
      if (connected(peer)) {
        clearTimer(peer);
        options.onState(id, 'connected');
      } else {
        options.onState(id, 'connecting');
        if (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed') arm(id, peer, 1000);
        else if (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected') arm(id, peer, 3000);
      }
    };
    pc.onconnectionstatechange = pc.oniceconnectionstatechange = stateChanged;
    const tracks = options.localStream?.getAudioTracks() ?? [];
    if (tracks.length) tracks.forEach((track) => pc.addTrack(track, options.localStream!));
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    options.onState(id, 'connecting');
    arm(id, peer);
    return pc;
  };
  const flushCandidates = async (peer: Peer, pc: RTCPeerConnection, connection: string) => {
    for (const candidate of peer.candidates.get(connection) ?? []) {
      if (peer.pc !== pc) return;
      await pc.addIceCandidate(candidate).catch(() => {});
    }
    peer.candidates.delete(connection);
  };
  const offer = (id: string, peer: Peer) => {
    if (peer.starting || !peer.session) return;
    peer.starting = true;
    queue(id, peer, async () => {
      try {
        const pc = build(id, peer, crypto.randomUUID());
        const description = await pc.createOffer();
        if (!active(id, peer) || peer.pc !== pc) return;
        await pc.setLocalDescription(description);
        if (active(id, peer) && peer.pc === pc) send(id, peer, 'offer', pc.localDescription?.toJSON());
      } finally {
        peer.starting = false;
      }
    });
  };
  function recover(id: string, peer: Peer, requested = false) {
    if (!active(id, peer) || (!requested && connected(peer))) return;
    peer.attempts = peer.attempts.filter((time) => Date.now() - time < 60_000);
    if (peer.attempts.length >= 3) {
      options.onState(id, 'failed');
      return;
    }
    peer.attempts.push(Date.now());
    ready(id, peer);
    if (peer.session) {
      if (options.me < id) offer(id, peer);
      else send(id, peer, 'restart');
    }
    arm(id, peer);
  }
  const receive = (message: ServerRtc) => {
    if (stopped || message.meetingId !== options.meetingId || message.from === options.me) return;
    const { signal, from: id } = message;
    if (!signal.sessionId || (signal.targetSessionId && signal.targetSessionId !== session)) return;
    if (signal.kind === 'ready') {
      const peer = adopt(id, signal.sessionId);
      if (!peer) return;
      if (!(signal.data as { ack?: boolean } | null)?.ack) ready(id, peer, true);
      if (options.me < id && !peer.pc) offer(id, peer);
      if (!connected(peer) && !peer.timer) arm(id, peer);
      return;
    }
    // An offer can overtake its ready message on the server's async membership lookup.
    if (signal.targetSessionId !== session) return;
    const peer = signal.kind === 'offer' && options.me > id ? adopt(id, signal.sessionId) : peers.get(id);
    if (!peer || peer.session !== signal.sessionId) return;
    if (signal.kind === 'restart') {
      if (options.me < id && (!signal.connectionId || signal.connectionId === peer.connection)) recover(id, peer, !!signal.connectionId);
      return;
    }
    const connection = signal.connectionId;
    if (!connection || peer.retired.has(connection)) return;
    if (signal.kind === 'offer' && options.me < id) return;
    if (signal.kind !== 'offer' && signal.kind !== 'ice' && connection !== peer.connection) return;
    queue(id, peer, async () => {
      if (peer.retired.has(connection)) return;
      if (signal.kind === 'ice') {
        const pc = peer.pc;
        if (peer.connection === connection && pc?.remoteDescription)
          await pc.addIceCandidate(signal.data as RTCIceCandidateInit).catch(() => {});
        else {
          if (!peer.candidates.has(connection) && peer.candidates.size >= 2) return;
          const pending = peer.candidates.get(connection) ?? [];
          if (pending.length < 256) pending.push(signal.data as RTCIceCandidateInit);
          peer.candidates.set(connection, pending);
        }
      } else if (signal.kind === 'offer') {
        let pc = peer.pc;
        if (peer.connection === connection && pc?.localDescription?.type === 'answer') {
          send(id, peer, 'answer', pc.localDescription.toJSON());
          return;
        }
        if (peer.connection !== connection || !pc) pc = build(id, peer, connection);
        await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
        if (!active(id, peer) || peer.pc !== pc) return;
        await flushCandidates(peer, pc, connection);
        const answer = await pc.createAnswer();
        if (!active(id, peer) || peer.pc !== pc) return;
        await pc.setLocalDescription(answer);
        if (active(id, peer) && peer.pc === pc) send(id, peer, 'answer', pc.localDescription?.toJSON());
      } else if (signal.kind === 'answer') {
        const pc = peer.pc;
        if (peer.connection !== connection || pc?.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
        if (active(id, peer) && peer.pc === pc) await flushCandidates(peer, pc, connection);
      }
    });
  };
  return {
    receive,
    sync(ids: string[]) {
      if (stopped) return;
      const previous = members;
      members = new Set(ids.filter((id) => id !== options.me));
      for (const id of members)
        if (!peers.has(id)) {
          const peer = ensure(id);
          ready(id, peer);
          arm(id, peer);
        }
      for (const id of previous)
        if (!members.has(id)) {
          const peer = peers.get(id);
          if (!peer) continue;
          if (peer.session) {
            const retired = retiredSessions.get(id) ?? new Set<string>();
            remember(retired, peer.session);
            retiredSessions.set(id, retired);
          }
          detach(id, peer);
          peers.delete(id);
        }
    },
    signalingRestored() {
      for (const [id, peer] of peers) {
        peer.attempts = [];
        ready(id, peer);
        if (!connected(peer)) {
          if (peer.session) recover(id, peer);
          else arm(id, peer);
        }
      }
    },
    close() {
      stopped = true;
      for (const [id, peer] of peers) detach(id, peer);
      peers.clear();
    },
  };
}
