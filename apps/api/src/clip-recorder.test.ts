import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startClipRecorder } from '../../web/src/features/meeting/clipRecorder.js';
class Recorder {
  static all: Recorder[] = [];
  static format = 'audio/webm;codecs=opus';
  static fail = false;
  static isTypeSupported = vi.fn((type: string) => type === Recorder.format);
  state = 'inactive';
  mimeType = Recorder.format;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  constructor(
    readonly stream: unknown,
    readonly options?: unknown,
  ) {
    Recorder.all.push(this);
  }
  start() {
    if (Recorder.fail) throw new Error('device');
    this.state = 'recording';
    this.onstart?.();
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['quiet audio']) });
    this.onstop?.();
  }
}
const stops: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MediaRecorder', Recorder);
  Recorder.all = [];
  Recorder.format = 'audio/webm;codecs=opus';
  Recorder.fail = false;
});
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function start() {
  const send = vi.fn(async (_clip: Blob) => {});
  const listening = vi.fn();
  const error = vi.fn();
  const stream = {};
  const stop = startClipRecorder({ stream: stream as MediaStream, send, onListening: listening, onError: error });
  stops.push(stop);
  return { send, listening, error, stop, stream };
}
it('uploads quiet clips without requiring an AudioContext or applying a volume threshold', async () => {
  const { send, listening } = start();
  expect(listening).toHaveBeenCalledWith(true);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0]![0].type).toBe('audio/webm;codecs=opus');
});
it('chooses a browser-supported audio format', async () => {
  Recorder.format = 'audio/mp4';
  const { send } = start();
  await vi.advanceTimersByTimeAsync(6000);
  expect(Recorder.all[0]!.options).toEqual({ mimeType: 'audio/mp4' });
  expect(send.mock.calls[0]![0].type).toBe('audio/mp4');
});
it('records all three members independently and stops only the departing member', async () => {
  const members = [start(), start(), start()];
  await vi.advanceTimersByTimeAsync(6000);
  members.forEach((member) => expect(member.send).toHaveBeenCalledOnce());
  members[2]!.stop();
  await vi.advanceTimersByTimeAsync(6000);
  expect(members[0]!.send).toHaveBeenCalledTimes(2);
  expect(members[1]!.send).toHaveBeenCalledTimes(2);
  expect(members[2]!.send).toHaveBeenCalledOnce();
});
it('serializes uploads, recovers after a failed request and ignores late failures after cleanup', async () => {
  const { send, error, stop } = start();
  let reject!: (error: Error) => void;
  send.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await vi.advanceTimersByTimeAsync(12_000);
  expect(send).toHaveBeenCalledOnce();
  reject(new Error('network'));
  await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenCalledTimes(2);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('could not be transcribed'));
  send.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  await vi.advanceTimersByTimeAsync(6000);
  stop();
  reject(new Error('late'));
  await Promise.resolve();
  expect(error).toHaveBeenLastCalledWith(null);
});
it('bounds the upload backlog and does not upload queued clips after leaving', async () => {
  const { send, error, stop } = start();
  let finish!: () => void;
  send.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(30_000);
  expect(send).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledWith(expect.stringContaining('falling behind'));
  stop();
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenCalledOnce();
});
it('reports recording failure instead of showing listening', () => {
  Recorder.fail = true;
  const { error, listening } = start();
  expect(listening).toHaveBeenCalledWith(false);
  expect(error).toHaveBeenCalledWith(expect.stringContaining('recording stopped'));
});
