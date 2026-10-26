import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deletePushToken, listPushTokensForMembers } from '../repositories/push-tokens.js';
import { getProject } from '../repositories/projects.js';
import { isReviewableSuggestion, notifySuggestionCreated } from './push.js';

describe('isReviewableSuggestion', () => {
  it('notifies idea, risk and topic drafts', () => {
    expect(isReviewableSuggestion({ kind: 'idea', status: 'pending', title: 'Draft' })).toBe(true);
    expect(isReviewableSuggestion({ kind: 'risk', status: 'pending', title: 'Slip' })).toBe(true);
    expect(isReviewableSuggestion({ kind: 'brainstorm_topic', status: 'pending', title: 'New topic' })).toBe(true);
  });

  it('skips dismissed cards and hidden brainstorm checks', () => {
    expect(isReviewableSuggestion({ kind: 'idea', status: 'dismissed', title: 'Draft' })).toBe(false);
    expect(isReviewableSuggestion({ kind: 'brainstorm_analysis', status: 'pending', title: 'Brainstorm checked: product' })).toBe(false);
  });

  it('notifies research cards the Assistant tab shows', () => {
    expect(isReviewableSuggestion({ kind: 'brainstorm_analysis', status: 'pending', title: 'Topic research: fitness' })).toBe(true);
  });
});

vi.mock('../repositories/projects.js', () => ({ getProject: vi.fn() }));
vi.mock('../repositories/push-tokens.js', () => ({ listPushTokensForMembers: vi.fn(), deletePushToken: vi.fn() }));

describe('Expo delivery', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  beforeEach(() => {
    vi.stubEnv('EXPO_PUSH', '1');
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getProject).mockResolvedValue({ memberIds: ['alex'] } as Awaited<ReturnType<typeof getProject>>);
    vi.mocked(listPushTokensForMembers).mockResolvedValue([{ memberId: 'alex', token: 'ExpoPushToken[one]' }]);
    vi.mocked(deletePushToken).mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  const notify = () =>
    notifySuggestionCreated({ projectId: 'private-project', id: 'private-id', title: 'Sensitive title', kind: 'idea', status: 'pending' });

  it('reports HTTP failures with batch context and keeps sending later batches', async () => {
    vi.mocked(listPushTokensForMembers).mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({ memberId: 'alex', token: `ExpoPushToken[${i}]` })),
    );
    fetchMock
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(Response.json({ data: [{ status: 'ok', id: 'ticket' }] }));
    notify();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(log).toHaveBeenCalledWith(
      'Expo push HTTP error',
      expect.objectContaining({ status: 429, detail: 'rate limited', batchOffset: 0, batchSize: 100 }),
    );
  });

  it('reports individual tickets, cleans up only invalid devices, and sends no private content', async () => {
    vi.mocked(listPushTokensForMembers).mockResolvedValue(
      ['one', 'two', 'three'].map((id) => ({ memberId: 'alex', token: `ExpoPushToken[${id}]` })),
    );
    fetchMock.mockResolvedValue(
      Response.json({
        data: [
          { status: 'ok', id: 'ticket' },
          { status: 'error', message: 'Unregistered device', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', message: 'Invalid credentials', details: { error: 'InvalidCredentials' } },
        ],
      }),
    );
    notify();
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(2));
    expect(deletePushToken).toHaveBeenCalledExactlyOnceWith('alex', 'ExpoPushToken[two]');
    expect(log).toHaveBeenCalledWith(
      'Expo push ticket error',
      expect.objectContaining({ ticketIndex: 1, code: 'DeviceNotRegistered', message: 'Unregistered device', tokenId: expect.any(String) }),
    );
    const messages = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(messages).toEqual(
      ['one', 'two', 'three'].map((id) => ({
        to: `ExpoPushToken[${id}]`,
        title: 'AI suggestion waiting for your approval',
        body: 'Open the app to check for updates.',
      })),
    );
  });

  it.each([{ data: [] }, { errors: [{ code: 'PUSH_TOO_MANY_NOTIFICATIONS' }] }, { data: [{ status: 'unexpected' }] }])(
    'reports malformed or missing tickets: %j',
    async (body) => {
      fetchMock.mockResolvedValue(Response.json(body));
      notify();
      await vi.waitFor(() =>
        expect(log).toHaveBeenCalledWith('Expo push invalid ticket response', expect.objectContaining({ batchSize: 1 })),
      );
      expect(deletePushToken).not.toHaveBeenCalled();
    },
  );

  it('continues reporting tickets when invalid-token cleanup fails', async () => {
    vi.mocked(listPushTokensForMembers).mockResolvedValue(
      ['one', 'two'].map((id) => ({ memberId: 'alex', token: `ExpoPushToken[${id}]` })),
    );
    vi.mocked(deletePushToken).mockRejectedValueOnce(new Error('database unavailable'));
    fetchMock.mockResolvedValue(
      Response.json({
        data: [
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', details: { error: 'InvalidCredentials' } },
        ],
      }),
    );
    notify();
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(3));
    expect(log).toHaveBeenCalledWith('Expo push ticket error', expect.objectContaining({ ticketIndex: 1, code: 'InvalidCredentials' }));
    expect(log).toHaveBeenCalledWith('Expo push token cleanup failed', expect.objectContaining({ ticketIndex: 0 }));
  });

  it('reports network failures without throwing to the caller', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(notify).not.toThrow();
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith('Expo push batch failed', expect.objectContaining({ error: expect.any(Error) })),
    );
  });
});
