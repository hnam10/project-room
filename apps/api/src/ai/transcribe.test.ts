import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../config.js';
import { transcribe } from './transcribe.js';

afterEach(() => {
  vi.unstubAllGlobals();
  (config as { groqApiKey: string | null }).groqApiKey = null;
});

describe('transcribe (Groq Whisper)', () => {
  it('sends the clip with the base language and drops segments Whisper marks as no speech', async () => {
    (config as { groqApiKey: string | null }).groqApiKey = 'gsk_test';
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({
          text: '회의 시작할게요 시청해 주셔서 감사합니다',
          segments: [
            { text: ' 회의 시작할게요', no_speech_prob: 0.05 },
            { text: ' 시청해 주셔서 감사합니다', no_speech_prob: 0.9 },
          ],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await transcribe(Buffer.from([1, 2, 3]), 'audio/webm;codecs=opus', 'ko-KR')).toBe('회의 시작할게요');
    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(form.get('language')).toBe('ko');
    expect((form.get('file') as File).name).toBe('clip.webm');
  });

  it('throws on an HTTP error so the client can retry', async () => {
    (config as { groqApiKey: string | null }).groqApiKey = 'gsk_test';
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('rate limited', { status: 429 })));
    await expect(transcribe(Buffer.from([1]), 'audio/webm', 'en-US')).rejects.toThrow('429');
  });
});
