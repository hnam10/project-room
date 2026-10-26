import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api/client';

let registeredToken: string | null = null;

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

export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Project Room',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const granted = existing.status === 'granted' ? existing : await Notifications.requestPermissionsAsync();
  if (granted.status !== 'granted') return;

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  registeredToken = token;
  await api.registerPushToken(token);
}

export function onNotificationOpen(handler: () => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}

export async function unregisterPushToken(): Promise<void> {
  if (!registeredToken) return;
  const token = registeredToken;
  registeredToken = null;
  try {
    await api.unregisterPushToken(token);
  } catch {
    // Signing out should still succeed if the API is unreachable.
  }
}
