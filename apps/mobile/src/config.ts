import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

/** Base URL for REST and WebSocket (no trailing slash). */
export function apiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  return extra?.apiUrl?.replace(/\/$/, '') ?? 'http://localhost:4000';
}

export const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

/** Free ngrok answers browser-like clients with a warning page until this header is set. */
export function tunnelHeaders(base = apiBaseUrl()): Record<string, string> {
  return base.includes('ngrok') ? { 'ngrok-skip-browser-warning': '1' } : {};
}
