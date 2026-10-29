interface Options {
  stream: MediaStream;
  send: (clip: Blob) => Promise<boolean | void>;
  onListening: (listening: boolean) => void;
  onError: (error: string | null) => void;
  onStatus?: (status: string) => void;
}

/** Each member records their own microphone. Analysis only avoids sending verified silence. */
export function startClipRecorder({ stream, send, onListening, onError, onStatus }: Options) {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sampler: ReturnType<typeof setInterval> | undefined;
  let current: MediaRecorder | undefined;
  let ctx: AudioContext | undefined;
  let peak = 0;
  let sampled = false;
  let reliable = true;
  const resume = () => {
    if (!stopped && ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
  };
  try {
    ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    sampler = setInterval(() => {
      if (ctx?.state !== 'running') {
        reliable = false;
        return;
      }
      sampled = true;
      analyser.getFloatTimeDomainData(buf);
      peak = Math.max(peak, Math.sqrt(buf.reduce((sum, value) => sum + value * value, 0) / buf.length));
    }, 100);
    resume();
  } catch {
    reliable = false;
  }
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
  document.addEventListener('visibilitychange', resume);
  const fail = () => {
    stopped = true;
    clearTimeout(timer);
    onListening(false);
    onStatus?.('Recording could not start');
    onError('Microphone recording stopped. Leave and rejoin to retry, and check your microphone permissions.');
  };
  const record = () => {
    if (stopped) return;
    try {
      const rec = new MediaRecorder(stream);
      const parts: Blob[] = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) parts.push(event.data);
      };
      rec.onstart = () => {
        if (!stopped) onListening(true);
      };
      rec.onerror = fail;
      rec.onstop = () => {
        if (stopped) return;
        // A suspended analyser returns zeroes; that does not prove the microphone is silent.
        const silent = reliable && sampled && peak <= 0.015;
        peak = 0;
        sampled = false;
        reliable = true;
        record();
        const clip = new Blob(parts, { type: rec.mimeType });
        if (silent || !clip.size) {
          onStatus?.(silent ? 'No sound detected in the last clip' : 'The recorder produced an empty clip');
          return;
        }
        onStatus?.('Sending your speech for transcription…');
        void send(clip).then(
          (saved) => {
            if (!stopped) {
              failures = 0;
              onError(null);
              onStatus?.(saved === false ? 'Speech service found no speech in the last clip' : 'Last clip transcribed successfully');
            }
          },
          (error: unknown) => {
            if (stopped) return;
            const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
            onStatus?.(`Transcription upload failed${typeof status === 'number' ? ` (${status})` : ''}`);
            if (!stopped && ++failures >= 3)
              onError('Transcription keeps failing, so your speech isn’t transcribed. Check your connection.');
          },
        );
      };
      rec.start();
      current = rec;
      timer = setTimeout(() => rec.state === 'recording' && rec.stop(), 6000);
    } catch {
      fail();
    }
  };
  onStatus?.('Recording microphone; waiting for the first clip…');
  record();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(sampler);
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
    document.removeEventListener('visibilitychange', resume);
    if (current) {
      current.onstop = current.onstart = current.onerror = current.ondataavailable = null;
      if (current.state !== 'inactive') current.stop();
    }
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
    onListening(false);
    onError(null);
    onStatus?.('Transcription is stopped');
  };
}
