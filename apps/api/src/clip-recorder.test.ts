import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startClipRecorder } from '../../web/src/features/meeting/clipRecorder.js';
class FakeContext {
  static state = 'running';
  static level = 0;
  state = FakeContext.state;
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createAnalyser() {
    return { fftSize: 1024, getFloatTimeDomainData: (buffer: Float32Array) => buffer.fill(FakeContext.level) };
  }
  createMediaStreamSource() {
    return { connect: vi.fn() };
  }
}
class FakeRecorder {
  static fail = false;
  state = 'inactive';
  mimeType = 'audio/webm';
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  start() {
    if (FakeRecorder.fail) throw new Error('device unavailable');
    this.state = 'recording';
    this.onstart?.();
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}
const stops: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  FakeContext.state = 'running';
  FakeContext.level = 0;
  FakeRecorder.fail = false;
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function start() {
  const send = vi.fn(async (_clip: Blob): Promise<boolean | void> => {});
  const listening = vi.fn();
  const error = vi.fn();
  const status = vi.fn();
  const stop = startClipRecorder({ stream: {} as MediaStream, send, onListening: listening, onError: error, onStatus: status });
  stops.push(stop);
  return { send, listening, error, stop, status };
}
it('distinguishes verified silence, an upload and a speech service returning no text', async () => {
  const { send, status } = start();
  await vi.advanceTimersByTimeAsync(6000);
  expect(status).toHaveBeenLastCalledWith('No sound detected in the last clip');
  FakeContext.level = 0.1;
  send.mockResolvedValue(false);
  await vi.advanceTimersByTimeAsync(6000);
  expect(status).toHaveBeenCalledWith('Sending your speech for transcription…');
  expect(status).toHaveBeenLastCalledWith('Speech service found no speech in the last clip');
  send.mockResolvedValue(true);
  await vi.advanceTimersByTimeAsync(6000);
  expect(status).toHaveBeenLastCalledWith('Last clip transcribed successfully');
});
it('shows the first failed upload status and does not overwrite stopped state with a late response', async () => {
  FakeContext.level = 0.1;
  const { send, status, stop } = start();
  send.mockRejectedValue({ status: 403 });
  await vi.advanceTimersByTimeAsync(6000);
  expect(status).toHaveBeenLastCalledWith('Transcription upload failed (403)');
  let finish!: (value: boolean) => void;
  send.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(6000);
  stop();
  finish(true);
  await Promise.resolve();
  expect(status).toHaveBeenLastCalledWith('Transcription is stopped');
});
it('sends clips even when the browser leaves audio analysis suspended', async () => {
  FakeContext.state = 'suspended';
  const { send, listening } = start();
  expect(listening).toHaveBeenCalledWith(true);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
});
it('skips verified silence but transcribes actual sound', async () => {
  const { send } = start();
  await vi.advanceTimersByTimeAsync(6000);
  expect(send).not.toHaveBeenCalled();
  FakeContext.level = 0.1;
  await vi.advanceTimersByTimeAsync(6000);
  expect(send).toHaveBeenCalledOnce();
});
it('records three members independently and stops only the member who left', async () => {
  FakeContext.level = 0.1;
  const members = [start(), start(), start()];
  await vi.advanceTimersByTimeAsync(6000);
  members.forEach(({ send }) => expect(send).toHaveBeenCalledOnce());
  members[2]!.stop();
  await vi.advanceTimersByTimeAsync(6000);
  expect(members[0]!.send).toHaveBeenCalledTimes(2);
  expect(members[1]!.send).toHaveBeenCalledTimes(2);
  expect(members[2]!.send).toHaveBeenCalledOnce();
});
it('reports recorder startup failure instead of pretending to listen', () => {
  FakeRecorder.fail = true;
  const { listening, error } = start();
  expect(listening).toHaveBeenCalledWith(false);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('recording stopped'));
});
it('records when audio analysis is unavailable', async () => {
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        throw new Error('unsupported');
      }
    },
  );
  const { send } = start();
  await vi.advanceTimersByTimeAsync(6000);
  expect(send).toHaveBeenCalledOnce();
});
