import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RtcSignal, ServerRtc } from '@project-room/shared';
import { createMeshAudio } from '../../web/src/features/meeting/meshAudio.js';

class Stream {
  constructor(readonly tracks: { kind: string; enabled: boolean }[] = []) {}
  getAudioTracks() {
    return this.tracks;
  }
}
class Peer {
  static all: Peer[] = [];
  id = Peer.all.length;
  connectionState = 'new';
  iceConnectionState = 'new';
  signalingState = 'stable';
  localDescription: (RTCSessionDescriptionInit & { toJSON: () => RTCSessionDescriptionInit }) | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  tracks: unknown[] = [];
  onicecandidate: ((event: unknown) => void) | null = null;
  ontrack: ((event: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  addTrack = vi.fn((track: unknown) => {
    this.tracks.push(track);
  });
  addTransceiver = vi.fn();
  addIceCandidate = vi.fn(async () => {
    if (!this.remoteDescription) throw new Error('no remote description');
  });
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: String(this.id) }));
  createAnswer = vi.fn(async () => ({ type: 'answer', sdp: `${this.remoteDescription!.sdp}:${this.id}` }));
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = { ...description, toJSON: () => description };
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';
    this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `ice-${this.id}` }) } });
  });
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    if (description.type === 'answer' && this.signalingState !== 'have-local-offer') throw new Error('stale answer');
    if (description.type === 'offer' && this.signalingState !== 'stable') throw new Error('offer collision');
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
    if (description.type === 'answer') {
      const other = Peer.all[Number(description.sdp!.split(':')[1])]!;
      this.state('connected');
      other.state('connected');
      for (const track of other.tracks) this.ontrack?.({ track });
      for (const track of this.tracks) other.ontrack?.({ track });
    }
  });
  close = vi.fn(() => {
    this.connectionState = 'closed';
  });
  constructor() {
    Peer.all.push(this);
  }
  state(value: string) {
    this.connectionState = this.iceConnectionState = value;
    this.onconnectionstatechange?.();
    this.oniceconnectionstatechange?.();
  }
}
const calls = new Map<string, ReturnType<typeof createMeshAudio>>();
const bus: { from: string; to: string; signal: RtcSignal }[] = [];
const history: typeof bus = [];
const streams = new Map<string, Stream>();
const received = new Map<string, ReturnType<typeof vi.fn>>();
beforeEach(() => {
  vi.useFakeTimers();
  Peer.all = [];
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('MediaStream', Stream);
});
afterEach(() => {
  calls.forEach((call) => call.close());
  calls.clear();
  streams.clear();
  received.clear();
  bus.length = history.length = 0;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function join(id: string, ids = ['a', 'b']) {
  const stream = new Stream([{ kind: 'audio', enabled: true }]);
  streams.set(id, stream);
  const onStream = vi.fn();
  received.set(id, onStream);
  const call = createMeshAudio({
    me: id,
    meetingId: 'meeting',
    iceServers: [],
    localStream: stream as unknown as MediaStream,
    sendSignal: (to, signal) => {
      const msg = { from: id, to, signal };
      bus.push(msg);
      history.push(msg);
    },
    onState: vi.fn(),
    onStream,
    onRemove: vi.fn(),
  });
  calls.set(id, call);
  call.sync(ids);
  return call;
}
async function pump(drop: (message: (typeof bus)[number]) => boolean = () => false) {
  for (let count = 0; count < 1000; count++) {
    await vi.advanceTimersByTimeAsync(0);
    const msg = bus.shift();
    if (!msg) return;
    if (!drop(msg)) calls.get(msg.to)?.receive({ type: 'rtc', meetingId: 'meeting', from: msg.from, signal: msg.signal });
  }
  throw new Error('Signaling loop');
}
async function pair() {
  join('a');
  join('b');
  await pump();
}
it('uses exactly one offer per pair, with both microphones attached before negotiation', async () => {
  await pair();
  expect(history.filter((msg) => msg.signal.kind === 'offer')).toHaveLength(1);
  expect(Peer.all).toHaveLength(2);
  Peer.all.forEach((peer) => {
    expect(peer.connectionState).toBe('connected');
    expect(peer.addTrack).toHaveBeenCalledOnce();
  });
  expect(received.get('a')).toHaveBeenCalledOnce();
  expect(received.get('b')).toHaveBeenCalledOnce();
});
it('connects a delayed third join without rebuilding the original pair', async () => {
  await pair();
  const original = [...Peer.all];
  calls.forEach((call) => call.sync(['a', 'b', 'c']));
  await pump(); // c is not ready yet
  join('c', ['a', 'b', 'c']);
  await pump();
  expect(Peer.all.filter((peer) => peer.connectionState === 'connected')).toHaveLength(6);
  original.forEach((peer) => expect(peer.close).not.toHaveBeenCalled());
  expect(received.get('c')).toHaveBeenCalledTimes(2);
});
it('rebuilds both sides when a member rejoins even if nobody observed their leave', async () => {
  const ids = ['a', 'b', 'c'];
  ids.forEach((id) => join(id, ids));
  await pump();
  const original = [...Peer.all];
  const oldSignals = [...history];
  calls.get('c')!.close();
  join('c', ids);
  await pump();
  expect(Peer.all.filter((peer) => peer.connectionState === 'connected')).toHaveLength(6);
  expect(original.filter((peer) => peer.close.mock.calls.length)).toHaveLength(4);
  const count = Peer.all.length;
  for (const msg of oldSignals) calls.get(msg.to)?.receive({ type: 'rtc', meetingId: 'meeting', from: msg.from, signal: msg.signal });
  await pump();
  expect(Peer.all).toHaveLength(count);
  expect(received.get('c')).toHaveBeenCalledTimes(2);
});
it('accepts ICE before its offer and suppresses a duplicate offer without a second connection', async () => {
  await pair();
  Peer.all.forEach((peer) => expect(peer.addIceCandidate).toHaveBeenCalledOnce());
  const offer = history.find((msg) => msg.signal.kind === 'offer')!;
  calls.get(offer.to)!.receive({ type: 'rtc', meetingId: 'meeting', from: offer.from, signal: offer.signal });
  await pump();
  expect(Peer.all).toHaveLength(2);
});
it('recovers a lost offer by replacing both sides with a fresh connection identity', async () => {
  join('a');
  join('b');
  let dropped = false;
  await pump((msg) => {
    if (msg.signal.kind === 'offer' && !dropped) {
      dropped = true;
      return true;
    }
    return false;
  });
  await vi.advanceTimersByTimeAsync(12_000);
  await pump();
  expect(Peer.all.filter((peer) => peer.connectionState === 'connected')).toHaveLength(2);
  const offers = history.filter((msg) => msg.signal.kind === 'offer');
  expect(offers.length).toBeGreaterThan(1);
  expect(offers[0]!.signal.connectionId).not.toBe(offers.at(-1)!.signal.connectionId);
});
it('lets a failed receiver reset a pair even when the offerer still reports connected', async () => {
  await pair();
  Peer.all[1]!.state('failed');
  await vi.advanceTimersByTimeAsync(1000);
  await pump();
  expect(Peer.all[0]!.close).toHaveBeenCalledOnce();
  expect(Peer.all.filter((peer) => peer.connectionState === 'connected')).toHaveLength(2);
});

it('discards old candidate buffers across repeated lost answers and ignores retired connection messages', async () => {
  join('a');
  join('b');
  let dropped = 0;
  const drop = (msg: (typeof bus)[number]) => msg.signal.kind === 'answer' && dropped++ < 2;
  await pump(drop);
  await vi.advanceTimersByTimeAsync(12_000);
  await pump(drop);
  await vi.advanceTimersByTimeAsync(12_000);
  await pump();
  expect(Peer.all.filter((peer) => peer.connectionState === 'connected')).toHaveLength(2);
  const count = Peer.all.length;
  const stale = history.filter(
    (msg) => msg.signal.connectionId === history.find((msg) => msg.signal.kind === 'offer')!.signal.connectionId,
  );
  for (const msg of stale) calls.get(msg.to)?.receive({ type: 'rtc', meetingId: 'meeting', from: msg.from, signal: msg.signal });
  await pump();
  expect(Peer.all).toHaveLength(count);
});
it('ignores short disconnections but rebuilds a persistently disconnected pair', async () => {
  await pair();
  const pc = Peer.all[0]!;
  pc.state('disconnected');
  await vi.advanceTimersByTimeAsync(1000);
  pc.state('connected');
  await vi.advanceTimersByTimeAsync(4000);
  expect(pc.close).not.toHaveBeenCalled();
  pc.state('disconnected');
  await vi.advanceTimersByTimeAsync(3000);
  await pump();
  expect(pc.close).toHaveBeenCalledOnce();
});
it('keeps healthy connections and microphone mute state through repeated membership and socket recovery', async () => {
  await pair();
  streams.get('a')!.tracks[0]!.enabled = false;
  calls.forEach((call) => {
    call.sync(['a', 'b']);
    call.signalingRestored();
  });
  await pump();
  expect(Peer.all).toHaveLength(2);
  expect(streams.get('a')!.tracks[0]!.enabled).toBe(false);
  Peer.all.forEach((peer) => expect(peer.close).not.toHaveBeenCalled());
});
it('bounds readiness retries, then allows an explicit retry after signaling returns', async () => {
  const call = join('a');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(history).toHaveLength(4);
  expect(Peer.all).toHaveLength(0);
  call.signalingRestored();
  join('b');
  await pump();
  expect(Peer.all.filter((peer) => peer.connectionState === 'connected')).toHaveLength(2);
});
it('removes departed peers and ignores their retired sessions and queued callbacks', async () => {
  await pair();
  const old = history.find((msg) => msg.from === 'b')!;
  const call = calls.get('a')!;
  call.sync(['a']);
  call.receive({ type: 'rtc', meetingId: 'meeting', from: 'b', signal: old.signal });
  await pump();
  expect(Peer.all).toHaveLength(2);
  expect(Peer.all[0]!.close).toHaveBeenCalledOnce();
});
it('ignores legacy, self, wrong-meeting and wrong-join messages', async () => {
  await pair();
  const base: ServerRtc = {
    type: 'rtc',
    meetingId: 'meeting',
    from: 'b',
    signal: { kind: 'ready', data: {}, sessionId: 'unseen', targetSessionId: 'wrong-join' },
  };
  const call = calls.get('a')!;
  call.receive(base);
  call.receive({ ...base, from: 'a' });
  call.receive({ ...base, meetingId: 'other' });
  call.receive({ ...base, signal: { kind: 'offer', data: {} } });
  await pump();
  expect(Peer.all).toHaveLength(2);
});
