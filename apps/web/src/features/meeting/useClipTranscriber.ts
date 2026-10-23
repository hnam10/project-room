import { useEffect, useState } from 'react';

const CLIP_MS = 6000;
const SILENCE_RMS = 0.015;

/**
 * Records the mic in back-to-back clips and hands each one that had sound to `send` (the server
 * transcribes it). Silent clips are skipped so they don't use the transcription quota.
 */
// ponytail: fixed 6s clips can split a word at the boundary; cut on pauses if that hurts accuracy
export function useClipTranscriber({
  stream,
  enabled,
  send,
}: {
  stream: MediaStream | null;
  enabled: boolean;
  send: (clip: Blob) => Promise<void>;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !stream || typeof MediaRecorder === 'undefined') return;
    let stopped = false;
    let failures = 0;
    let timer: number | undefined;
    let current: MediaRecorder | undefined;

    // Loudest moment of the current clip, sampled every 100ms.
    const ctx = new AudioContext();
    void ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0;
    const sampler = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      peak = Math.max(peak, Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length));
    }, 100);

    const record = () => {
      if (stopped) return;
      const rec = new MediaRecorder(stream);
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstart = () => setListening(true);
      rec.onstop = () => {
        const loud = peak > SILENCE_RMS;
        peak = 0;
        record();
        if (!loud) return;
        send(new Blob(parts, { type: rec.mimeType })).then(
          () => {
            failures = 0;
            setError(null);
          },
          () => {
            if (++failures >= 3) setError('Transcription keeps failing, so your speech isn’t transcribed. Check your connection.');
          },
        );
      };
      rec.start();
      current = rec;
      timer = window.setTimeout(() => rec.state === 'recording' && rec.stop(), CLIP_MS);
    };
    record();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearInterval(sampler);
      if (current) {
        current.onstop = null;
        if (current.state === 'recording') current.stop();
      }
      void ctx.close();
      setListening(false);
      setError(null);
    };
  }, [stream, enabled, send]);

  return { listening, error };
}
