import { config } from '../config.js';

// Server-side speech-to-text with Whisper on Groq (free tier), used when GROQ_API_KEY is set. Browsers
// send short clips of their own mic, so speaker labels stay exact. Without the key, browsers fall back to
// the Web Speech API.

interface Segment {
  text: string;
  no_speech_prob: number;
}

export const serverTranscription = () => !!config.groqApiKey;

const EXTENSIONS: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' };

/** Returns the clip's text, or '' for silence. `language` is a BCP 47 tag such as 'ko-KR'. */
export async function transcribe(audio: Buffer, type: string, language: string): Promise<string> {
  if (!config.groqApiKey) throw new Error('Server transcription is not configured');
  const mime = type.split(';')[0]!.trim();
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `clip.${EXTENSIONS[mime] ?? 'webm'}`);
  form.append('model', config.groqSttModel);
  form.append('language', language.split('-')[0]!);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.groqApiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { text: string; segments?: Segment[] };
  // Whisper invents text for silence ("Thanks for watching"); drop segments it thinks hold no speech.
  if (!data.segments) return data.text.trim();
  return data.segments
    .filter((s) => s.no_speech_prob < 0.5)
    .map((s) => s.text.trim())
    .join(' ')
    .trim();
}
