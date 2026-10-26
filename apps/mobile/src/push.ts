import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { api } from './api/client';

type Registration = { token: string; revocationKey: string };
const storageKey = 'push-token-cleanup';
let registeredToken: Registration | null = null;
let generation = 0;
let operations: Promise<void> = Promise.resolve();
let cleanup: Promise<void> | null = null;

// Serialize registration, retries and removal so a POST always settles before its DELETE.
function serialize(operation: () => Promise<void>): Promise<void> {
  const result = operations.then(operation);
  operations = result.catch(() => undefined);
  return result;
}

async function removeStoredToken(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(storageKey);
  if (!stored) return true;
  const pending = JSON.parse(stored) as Registration;
  if (registeredToken?.revocationKey === pending.revocationKey) return true;
  try {
    await api.unregisterPushToken(pending.token, pending.revocationKey);
    await SecureStore.deleteItemAsync(storageKey);
    return true;
  } catch {
    // Keep the credential on disk until the server confirms removal, including after sign-out/restart.
    return false;
  }
}

export function retryPushTokenCleanup(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return Promise.resolve();
  if (!cleanup) {
    cleanup = serialize(async () => {
      await removeStoredToken();
    }).finally(() => {
      cleanup = null;
    });
  }
  return cleanup;
}

/** Lives in the root layout so cleanup continues while signed out; retries on resume and while online. */
export function startPushTokenCleanup(): () => void {
  if (Platform.OS === 'web' || !Device.isDevice) return () => undefined;
  const retry = () => {
    void retryPushTokenCleanup().catch(() => undefined);
  };
  retry();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') retry();
  });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active') retry();
  }, 15000);
  return () => {
    subscription.remove();
    clearInterval(timer);
  };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function syncAppBadge(count: number): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Badges are best-effort (especially on Android).
  }
}

export async function clearAppBadge(): Promise<void> {
  await syncAppBadge(0);
}

export function registerPushToken(signal?: AbortSignal): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return Promise.resolve();
  const attempt = ++generation;
  const cancelled = () => signal?.aborted || generation !== attempt;
  return serialize(async () => {
    if (cancelled()) return;
    registeredToken = null;
    if (!(await removeStoredToken()) || cancelled()) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Project Room',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    if (cancelled()) return;
    const existing = await Notifications.getPermissionsAsync();
    if (cancelled()) return;
    const granted = existing.status === 'granted' ? existing : await Notifications.requestPermissionsAsync();
    if (granted.status !== 'granted' || cancelled()) return;

    const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    if (cancelled()) return;
    const registration = { token, revocationKey: randomUUID() };
    // Persist before POST: even a lost HTTP response must leave enough information to revoke.
    await SecureStore.setItemAsync(storageKey, JSON.stringify(registration));
    if (cancelled()) return;
    registeredToken = registration;
    try {
      await api.registerPushToken(token, registration.revocationKey);
    } catch (error) {
      registeredToken = null;
      throw error;
    }
  });
}

export function onNotificationOpen(handler: () => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}

export function unregisterPushToken(): Promise<void> {
  ++generation;
  registeredToken = null;
  if (Platform.OS === 'web' || !Device.isDevice) return Promise.resolve();
  return serialize(async () => {
    await removeStoredToken();
  });
}
