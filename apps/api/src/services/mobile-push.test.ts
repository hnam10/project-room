// Exercise the mobile lifecycle in the API's Node test runner with native boundaries mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as mobileClient from '../../../mobile/src/api/client';

const mocks = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  register: vi.fn(),
  unregister: vi.fn(),
  token: vi.fn(),
  permissions: vi.fn(),
  resume: vi.fn(),
  removeListener: vi.fn(),
  randomUUID: vi.fn(),
}));
vi.mock('expo-constants', () => ({ default: { easConfig: { projectId: 'test-project' } } }));
vi.mock('expo-device', () => ({ isDevice: true }));
vi.mock('expo-crypto', () => ({ randomUUID: mocks.randomUUID }));
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: mocks.permissions,
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: mocks.token,
}));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mocks.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mocks.storage.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mocks.storage.delete(key);
  }),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { currentState: 'active', addEventListener: mocks.resume },
}));
vi.mock('../../../mobile/src/api/client', () => ({ api: { registerPushToken: mocks.register, unregisterPushToken: mocks.unregister } }));

const load = () => import('../../../mobile/src/push');
const key = '6c505322-479c-4689-b416-1baa42be238c';
const token = 'ExpoPushToken[test-device]';

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.storage.clear();
  mocks.randomUUID.mockReturnValue(key);
  mocks.token.mockResolvedValue({ data: token });
  mocks.permissions.mockResolvedValue({ status: 'granted' });
  mocks.register.mockResolvedValue(undefined);
  mocks.unregister.mockResolvedValue(undefined);
  mocks.resume.mockReturnValue({ remove: mocks.removeListener });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('mobile push lifecycle', () => {
  it('cancels a delayed registration before sign-out completes', async () => {
    const delayed = Promise.withResolvers<{ data: string }>();
    mocks.token.mockReturnValue(delayed.promise);
    const push = await load();
    const registration = push.registerPushToken();
    await vi.waitFor(() => expect(mocks.token).toHaveBeenCalled());
    const removal = push.unregisterPushToken();
    delayed.resolve({ data: token });
    await Promise.all([registration, removal]);
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.storage.size).toBe(0);
  });

  it('waits for an in-flight POST before revoking and persists the secret before sending', async () => {
    const delayed = Promise.withResolvers<void>();
    mocks.register.mockImplementation(() => {
      expect(JSON.parse(mocks.storage.get('push-token-cleanup')!)).toEqual({ token, revocationKey: key });
      return delayed.promise;
    });
    const push = await load();
    const registration = push.registerPushToken();
    await vi.waitFor(() => expect(mocks.register).toHaveBeenCalled());
    let signedOut = false;
    const removal = push.unregisterPushToken().then(() => {
      signedOut = true;
    });
    await Promise.resolve();
    expect(signedOut).toBe(false);
    expect(mocks.unregister).not.toHaveBeenCalled();
    delayed.resolve();
    await Promise.all([registration, removal]);
    expect(mocks.unregister).toHaveBeenCalledExactlyOnceWith(token, key);
    expect(mocks.storage.size).toBe(0);
    expect(signedOut).toBe(true);
  });

  it('preserves failed revocations across restart and retries without registering again', async () => {
    const push = await load();
    await push.registerPushToken();
    mocks.unregister.mockRejectedValueOnce(new Error('offline'));
    await push.unregisterPushToken();
    expect(mocks.storage.size).toBe(1);
    vi.resetModules();
    await (await load()).retryPushTokenCleanup();
    expect(mocks.unregister).toHaveBeenCalledTimes(2);
    expect(mocks.storage.size).toBe(0);
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });

  it('cleans up uncertain registration after a lost POST response', async () => {
    const push = await load();
    mocks.register.mockRejectedValueOnce(new Error('response lost'));
    await expect(push.registerPushToken()).rejects.toThrow('response lost');
    await push.unregisterPushToken();
    expect(mocks.unregister).toHaveBeenCalledWith(token, key);
    expect(mocks.storage.size).toBe(0);
  });

  it('does not overwrite pending cleanup while offline', async () => {
    mocks.storage.set('push-token-cleanup', JSON.stringify({ token, revocationKey: key }));
    mocks.unregister.mockRejectedValue(new Error('offline'));
    await (await load()).registerPushToken();
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.storage.size).toBe(1);
  });

  it('cancels registration when the workspace effect is cleaned up', async () => {
    const delayed = Promise.withResolvers<{ status: string }>();
    mocks.permissions.mockReturnValue(delayed.promise);
    const signal = new AbortController();
    const registration = (await load()).registerPushToken(signal.signal);
    await vi.waitFor(() => expect(mocks.permissions).toHaveBeenCalled());
    signal.abort();
    delayed.resolve({ status: 'granted' });
    await registration;
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it('retries pending cleanup after connectivity returns while signed out and on app resume', async () => {
    const push = await load();
    await push.registerPushToken();
    mocks.unregister.mockRejectedValueOnce(new Error('offline'));
    await push.unregisterPushToken();
    vi.useFakeTimers();
    // Startup is offline too; the interval retries once the server becomes reachable.
    mocks.unregister.mockRejectedValueOnce(new Error('offline'));
    const stop = push.startPushTokenCleanup();
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.storage.size).toBe(0);
    expect(mocks.unregister).toHaveBeenCalledTimes(3);
    const onResume = mocks.resume.mock.calls[0]![1];
    onResume('active');
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(mocks.removeListener).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('sends revocation with only its scoped secret after Clerk credentials are gone', async () => {
    const { bindClerkGetToken, clearClerkGetToken } = await import('../../../mobile/src/api/auth');
    const getToken = vi.fn().mockRejectedValue(new Error('session ended'));
    bindClerkGetToken(getToken);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { api } = await vi.importActual<typeof mobileClient>('../../../mobile/src/api/client');
      await api.unregisterPushToken(token, key);
      expect(getToken).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:4000/api/push-token/revoke',
        expect.objectContaining({
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, revocationKey: key }),
        }),
      );
    } finally {
      clearClerkGetToken();
      vi.unstubAllGlobals();
    }
  });
});
