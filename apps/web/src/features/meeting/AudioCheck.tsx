import { useEffect, useRef, useState } from 'react';
import type { AudioPeerCheck } from './meshAudio';

/** Local checks contain no recordings, addresses, credentials or SDP. */
export function AudioCheck({
  stream,
  check,
  transcript,
  names,
}: {
  stream: MediaStream | null;
  check: () => Promise<AudioPeerCheck[]>;
  transcript: string;
  names: Map<string, { name: string }>;
}) {
  const [running, setRunning] = useState(false);
  const [mic, setMic] = useState('');
  const [level, setLevel] = useState(0);
  const [peers, setPeers] = useState<AudioPeerCheck[]>([]);
  const stop = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stop.current?.();
    },
    [stream],
  );
  const start = () => {
    stop.current?.();
    setRunning(true);
    const track = stream?.getAudioTracks()[0];
    if (!track || !stream) {
      setMic('No microphone is connected to this call. Check site permissions and rejoin.');
      setLevel(0);
      return;
    }
    let active = true;
    let ctx: AudioContext | undefined;
    let analyser: AnalyserNode | undefined;
    let buffer: Float32Array<ArrayBuffer> | undefined;
    try {
      // A deliberate click lets browsers unlock analysis for this check.
      ctx = new AudioContext();
      void ctx.resume().catch(() => {});
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      buffer = new Float32Array(analyser.fftSize);
    } catch {
      /* Track and transport checks still work without Web Audio. */
    }
    const sample = () => {
      let rms = 0;
      if (analyser && buffer && ctx?.state === 'running') {
        analyser.getFloatTimeDomainData(buffer);
        rms = Math.sqrt(buffer.reduce((sum, value) => sum + value * value, 0) / buffer.length);
      }
      setLevel(Math.min(1, rms * 5));
      const state =
        track.readyState === 'ended'
          ? 'Microphone disconnected'
          : !track.enabled
            ? 'Microphone muted in this call'
            : track.muted
              ? 'Browser is not receiving microphone audio'
              : ctx?.state !== 'running'
                ? 'Browser audio analysis is unavailable'
                : rms > 0.003
                  ? 'Microphone is detecting sound'
                  : 'No sound detected; check the microphone selected in your browser';
      setMic(`${track.label || 'Microphone'}: ${state}`);
    };
    let checking = false;
    const poll = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = await check();
        if (active) setPeers(result);
      } catch {
        if (active) setPeers([]);
      } finally {
        checking = false;
      }
    };
    sample();
    void poll();
    const sampler = window.setInterval(sample, 200);
    const timer = window.setInterval(() => void poll(), 1000);
    stop.current = () => {
      active = false;
      window.clearInterval(sampler);
      window.clearInterval(timer);
      if (ctx) void ctx.close().catch(() => {});
    };
  };
  return (
    <details
      className="meeting-notice"
      onToggle={(event) => {
        if (!event.currentTarget.open) {
          stop.current?.();
          setRunning(false);
        }
      }}
    >
      <summary>Audio check</summary>
      <p>Check this on the person’s browser whose voice or transcript is missing.</p>
      <button className="btn sm" onClick={start}>
        Check my microphone
      </button>
      {running && (
        <>
          <p>{mic}</p>
          <meter aria-label="Microphone input level" min={0} max={1} value={level} />
          <p>{transcript}</p>
          {peers.map((peer) => (
            <p key={peer.id}>
              {names.get(peer.id)?.name ?? 'Participant'}: {peer.state} · sent {peer.sent} bytes · received {peer.received} bytes
            </p>
          ))}
          <p>Audio byte counts can increase during silence. The input meter checks whether sound is reaching the microphone.</p>
        </>
      )}
    </details>
  );
}
