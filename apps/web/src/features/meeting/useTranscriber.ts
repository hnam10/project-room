import { useEffect, useRef, useState } from 'react';

// Minimal Web Speech API typings (lib.dom doesn't ship them everywhere).
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
const Recognizer: RecognitionCtor | undefined = Ctor.SpeechRecognition ?? Ctor.webkitSpeechRecognition;

/** Browser speech-to-text. Restarts itself when the browser ends a session while `enabled`. */
export function useTranscriber(opts: { language: string; enabled: boolean; onFinal: (text: string) => void }) {
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const onFinal = useRef(opts.onFinal);
  useEffect(() => {
    onFinal.current = opts.onFinal;
  });

  const { language, enabled } = opts;
  useEffect(() => {
    if (!Recognizer || !enabled) return;
    const rec = new Recognizer();
    let stopped = false;
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) onFinal.current(r[0].transcript.trim());
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onstart = () => setListening(true);
    rec.onerror = (e) => {
      // Permission denied / no mic: don't loop forever.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') stopped = true;
    };
    rec.onend = () => {
      setInterim('');
      if (stopped) return setListening(false);
      try {
        rec.start();
      } catch {
        setListening(false);
      }
    };
    try {
      rec.start();
    } catch {
      // start() throws if already started; onend will retry
    }
    return () => {
      stopped = true;
      rec.onend = null;
      rec.onresult = null;
      rec.stop();
      setListening(false);
      setInterim('');
    };
  }, [language, enabled]);

  return { supported: !!Recognizer, interim, listening };
}
