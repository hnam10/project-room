interface Options {
  stream: MediaStream;
  send: (clip: Blob) => Promise<unknown>;
  onListening: (listening: boolean) => void;
  onError: (error: string | null) => void;
}
const FORMATS = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];

/** Record the member's mic independently of peer connections and Web Audio/autoplay state. */
export function startClipRecorder({ stream, send, onListening, onError }: Options) {
  let stopped = false;
  let recorder: MediaRecorder | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  let pending = 0;
  const fail = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    onListening(false);
    onError('Microphone recording stopped. Allow microphone access and rejoin to try again.');
  };
  const record = () => {
    if (stopped) return;
    try {
      const mimeType = FORMATS.find((type) => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder = rec;
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
        // Some browsers label an audio-only MP4 recording as video/mp4.
        const type = (rec.mimeType || mimeType || 'audio/webm').replace(/^video\/mp4/, 'audio/mp4');
        const clip = new Blob(parts, { type });
        record();
        if (!clip.size) return;
        if (pending >= 3) {
          onError('Transcription is falling behind. Check your connection.');
          return;
        }
        pending++;
        queue = queue.then(async () => {
          try {
            if (stopped) return;
            await send(clip);
            if (!stopped) onError(null);
          } catch {
            if (!stopped) onError('Your speech could not be transcribed. Check your connection and rejoin if this continues.');
          } finally {
            pending--;
          }
        });
      };
      rec.start();
      timer = setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
      }, 6000);
    } catch {
      fail();
    }
  };
  record();
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (recorder) {
      recorder.onstart = recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    onListening(false);
    onError(null);
  };
}
