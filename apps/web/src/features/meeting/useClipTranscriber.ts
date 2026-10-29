import { useEffect, useState } from 'react';
import { startClipRecorder } from './clipRecorder';

/** Each participant transcribes the same microphone they send to the call. */
export function useClipTranscriber({
  stream,
  enabled,
  send,
}: {
  stream: MediaStream | null;
  enabled: boolean;
  send: (clip: Blob) => Promise<unknown>;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !stream) return;
    return startClipRecorder({ stream, send, onListening: setListening, onError: setError });
  }, [stream, enabled, send]);
  return { listening, error };
}
