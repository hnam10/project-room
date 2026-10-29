import { useEffect, useState } from 'react';

/** True while the stream's audio level (RMS via an AnalyserNode) is above a speaking threshold. */
export function useSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const ctx = new AudioContext();
    const resume = () => {
      if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
    };
    resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    document.addEventListener('visibilitychange', resume);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      setSpeaking(Math.sqrt(sum / buf.length) > 0.02);
    }, 100);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      document.removeEventListener('visibilitychange', resume);
      void ctx.close().catch(() => {});
      setSpeaking(false);
    };
  }, [stream]);
  return speaking;
}
