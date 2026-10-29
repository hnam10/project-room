import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RtcSignal, ServerRtc } from '@project-room/shared';
import { createMeshAudio } from '../../web/src/features/meeting/meshAudio.js';

// Run the dependency-free browser transport in the existing test runner. Fake peers expose
// signaling races and failed transports without microphones, model calls or new dependencies.
class FakePeer {
  static all: FakePeer[] = [];
  connectionState = 'new';
  iceConnectionState = 'new';
  signalingState = 'stable';
  localDescription: { type: string; toJSON: () => unknown } | null = null;
  remoteDescription: unknown = null;
  onnegotiationneeded: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onicecandidate = null;
  ontrack = null;
  remoteGate: Promise<void> | null = null;
  addTrack = vi.fn();
  addTransceiver = vi.fn();
  addIceCandidate = vi.fn(async () => {});
  restartIce = vi.fn();
  setLocalDescription = vi.fn(async () => {
    const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
    this.localDescription = { type, toJSON: () => ({ type, sdp: 'test' }) };
    this.signalingState = type === 'answer' ? 'stable' : 'have-local-offer';
  });
  setRemoteDescription = vi.fn(async (description: { type: string }) => {
    if (this.remoteGate) await this.remoteGate;
    this.remoteDescription = description;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  });
  close = vi.fn(() => {
    this.connectionState = 'closed';
  });
  constructor() {
    FakePeer.all.push(this);
  }
  state(state: string) {
    this.connectionState = this.iceConnectionState = state;
    this.onconnectionstatechange?.();
    this.oniceconnectionstatechange?.();
  }
}

const controllers: ReturnType<typeof createMeshAudio>[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  FakePeer.all = [];
  vi.stubGlobal('RTCPeerConnection', FakePeer);
});
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(me = 'a', members = ['a', 'z']) {
  const send = vi.fn();
  const state = vi.fn();
  const remove = vi.fn();
  const controller = createMeshAudio({
    me,
    meetingId: 'meeting',
    iceServers: [],
    localStream: null,
    sendSignal: send,
    onState: state,
    onStream: vi.fn(),
    onRemove: remove,
  });
  controllers.push(controller);
  controller.sync(members);
  const receive = (kind: RtcSignal['kind'], from = me === 'a' ? 'z' : 'a') =>
    controller.receive({
      type: 'rtc',
      meetingId: 'meeting',
      from,
      signal: { kind, data: kind === 'ice' ? { candidate: 'test' } : { type: kind, sdp: 'test' } },
    });
  return { controller, send, state, remove, receive, peer: FakePeer.all[0]! };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

it('negotiates every pair in a three-person mesh and replaces only the returning member connections', async () => {
  const network = new Map<string, ReturnType<typeof createMeshAudio>>();
  const ids = ['a', 'b', 'c'];
  const join = (me: string) => {
    const track = { enabled: true };
    const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
    const controller = createMeshAudio({
      me,
      meetingId: 'meeting',
      iceServers: [],
      localStream: stream,
      sendSignal: (to, signal) => network.get(to)?.receive({ type: 'rtc', meetingId: 'meeting', from: me, signal }),
      onState: vi.fn(),
      onStream: vi.fn(),
      onRemove: vi.fn(),
    });
    controllers.push(controller);
    network.set(me, controller);
    return controller;
  };
  ids.forEach(join);
  network.forEach((controller) => controller.sync(ids));
  const original = [...FakePeer.all];
  original.forEach((peer) => peer.onnegotiationneeded?.());
  await flush();
  expect(original).toHaveLength(6);
  original.forEach((peer) => {
    expect(peer.signalingState).toBe('stable');
    expect(peer.addTrack).toHaveBeenCalledOnce();
    peer.state('connected');
  });
  network.get('c')!.close();
  network.delete('c');
  network.forEach((controller) => controller.sync(['a', 'b']));
  join('c');
  network.forEach((controller) => controller.sync(ids));
  FakePeer.all.slice(6).forEach((peer) => peer.onnegotiationneeded?.());
  await flush();
  expect(original[0]!.close).not.toHaveBeenCalled(); // a -> b
  expect(original[2]!.close).not.toHaveBeenCalled(); // b -> a
  FakePeer.all.slice(6).forEach((peer) => expect(peer.signalingState).toBe('stable'));
});

it('ignores a colliding offer and its candidates on the impolite side, then accepts the answer', async () => {
  const { peer, receive, send } = setup('z');
  peer.onnegotiationneeded?.();
  await flush();
  receive('offer');
  receive('ice');
  await flush();
  expect(peer.setRemoteDescription).not.toHaveBeenCalled();
  expect(peer.addIceCandidate).not.toHaveBeenCalled();
  receive('answer');
  receive('ice');
  await flush();
  expect(peer.setRemoteDescription).toHaveBeenCalledOnce();
  expect(peer.addIceCandidate).toHaveBeenCalledOnce();
  expect(send.mock.calls[0]?.[1].kind).toBe('offer');
});

it('rolls back the polite side of a simultaneous offer and replies with an answer', async () => {
  const { peer, receive, send } = setup();
  peer.onnegotiationneeded?.();
  await flush();
  receive('offer');
  await flush();
  expect(send.mock.calls.map((call) => call[1].kind)).toEqual(['offer', 'answer']);
  expect(peer.signalingState).toBe('stable');
});

it('serializes local negotiation behind a pending remote answer', async () => {
  const { peer, receive } = setup();
  peer.onnegotiationneeded?.();
  await flush();
  let resolve!: () => void;
  peer.remoteGate = new Promise<void>((done) => {
    resolve = done;
  });
  receive('answer');
  await flush();
  peer.onnegotiationneeded?.();
  await flush();
  expect(peer.setLocalDescription).toHaveBeenCalledOnce();
  resolve();
  await flush();
  expect(peer.setLocalDescription).toHaveBeenCalledTimes(2);
});

it('holds early ICE candidates until a remote description has been applied', async () => {
  const { peer, receive, send } = setup();
  receive('ice');
  await flush();
  expect(peer.addIceCandidate).not.toHaveBeenCalled();
  receive('offer');
  await flush();
  expect(peer.addIceCandidate).toHaveBeenCalledOnce();
  expect(send.mock.calls.at(-1)?.[1].kind).toBe('answer');
});

it('resends a lost offer without replacing its peer or microphone tracks', async () => {
  const { peer, send } = setup();
  peer.onnegotiationneeded?.();
  await flush();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(send).toHaveBeenCalledTimes(2);
  expect(FakePeer.all).toHaveLength(1);
  expect(peer.close).not.toHaveBeenCalled();
  peer.state('connected');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(send).toHaveBeenCalledTimes(2);
});

it('allows a transient disconnect to recover and restarts ICE for a persistent drop', async () => {
  const { peer } = setup();
  peer.state('connected');
  peer.state('disconnected');
  await vi.advanceTimersByTimeAsync(2000);
  peer.state('connected');
  await vi.advanceTimersByTimeAsync(2000);
  expect(peer.restartIce).not.toHaveBeenCalled();
  peer.state('disconnected');
  await vi.advanceTimersByTimeAsync(3000);
  expect(peer.restartIce).toHaveBeenCalledOnce();
  expect(FakePeer.all).toHaveLength(1);
  peer.state('connected');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(peer.restartIce).toHaveBeenCalledOnce();
});

it('bounds retries and retries failed pairs on signaling reconnect without touching healthy pairs', async () => {
  const { controller, state } = setup('a', ['a', 'y', 'z']);
  const [failed, healthy] = FakePeer.all;
  healthy!.state('connected');
  failed!.state('failed');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(failed!.restartIce).toHaveBeenCalledTimes(3);
  expect(state).toHaveBeenCalledWith('y', 'failed');
  expect(healthy!.restartIce).not.toHaveBeenCalled();
  controller.signalingRestored();
  await flush();
  expect(failed!.restartIce).toHaveBeenCalledTimes(4);
  expect(healthy!.restartIce).not.toHaveBeenCalled();
});

it('removing members cancels timers and ignores stale callbacks after leaving', async () => {
  const { controller, peer, send, remove } = setup();
  const staleNegotiation = peer.onnegotiationneeded!;
  controller.sync(['a']);
  staleNegotiation();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(peer.close).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith('z');
  expect(send).not.toHaveBeenCalled();
  controller.close();
  controller.receive({ type: 'rtc', meetingId: 'meeting', from: 'z', signal: { kind: 'offer', data: {} } });
  expect(FakePeer.all).toHaveLength(1);
});

it('ignores signals from a different meeting or from this member', () => {
  const { controller } = setup('a', ['a']);
  const signal: ServerRtc = { type: 'rtc', meetingId: 'other', from: 'z', signal: { kind: 'offer', data: {} } };
  controller.receive(signal);
  controller.receive({ ...signal, meetingId: 'meeting', from: 'a' });
  expect(FakePeer.all).toHaveLength(0);
});

it('keeps the same microphone track through mute changes, membership echoes and ICE recovery', async () => {
  const track = { enabled: true };
  const stream = { getAudioTracks: () => [track] } as unknown as Parameters<typeof createMeshAudio>[0]['localStream'];
  const controller = createMeshAudio({
    me: 'a',
    meetingId: 'meeting',
    iceServers: [],
    localStream: stream,
    sendSignal: vi.fn(),
    onState: vi.fn(),
    onStream: vi.fn(),
    onRemove: vi.fn(),
  });
  controllers.push(controller);
  controller.sync(['a', 'z']);
  const peer = FakePeer.all[0]!;
  expect(peer.addTrack).toHaveBeenCalledWith(track, stream);
  peer.state('connected');
  track.enabled = false;
  controller.sync(['a', 'z']);
  peer.state('failed');
  await flush();
  expect(peer.restartIce).toHaveBeenCalledOnce();
  expect(track.enabled).toBe(false);
  track.enabled = true;
  peer.state('connected');
  expect(peer.addTrack).toHaveBeenCalledOnce();
  expect(FakePeer.all).toHaveLength(1);
});

it('continues processing offers after a rejected stale answer', async () => {
  const { peer, receive, send } = setup();
  peer.setRemoteDescription.mockRejectedValueOnce(new Error('stale answer'));
  receive('answer');
  receive('offer');
  await flush();
  expect(send.mock.calls.at(-1)?.[1].kind).toBe('answer');
});

it('does not answer or recreate a peer removed while a remote description was applying', async () => {
  const { controller, peer, receive, send } = setup();
  let resolve!: () => void;
  peer.remoteGate = new Promise<void>((done) => {
    resolve = done;
  });
  receive('offer');
  await flush();
  controller.sync(['a']);
  resolve();
  await flush();
  expect(send).not.toHaveBeenCalled();
  expect(peer.close).toHaveBeenCalledOnce();
  expect(FakePeer.all).toHaveLength(1);
});
