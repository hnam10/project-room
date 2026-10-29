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
  send: (clip: Blob) => Promise<boolean | void>;
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Transcription is stopped');
  useEffect(() => {
    if (!enabled || !stream) return;
    return startClipRecorder({ stream, send, onListening: setListening, onError: setError, onStatus: setStatus });
  }, [stream, enabled, send]);
  return { listening, error, status };
}
