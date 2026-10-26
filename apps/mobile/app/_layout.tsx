import { ClerkLoaded, ClerkProvider } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { clerkPublishableKey } from '@/src/config';
import { colors } from '@/src/theme';

export default function RootLayout() {
  if (!clerkPublishableKey) {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="setup" />
      </Stack>
    );
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <ClerkLoaded>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.ink,
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: '600', fontSize: 15 },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
          <Stack.Screen name="choose-team" options={{ title: 'Projects', headerBackButtonDisplayMode: 'minimal' }} />
          <Stack.Screen name="(workspace)" options={{ headerShown: false }} />
          <Stack.Screen name="setup" options={{ title: 'Setup' }} />
        </Stack>
      </ClerkLoaded>
    </ClerkProvider>
  );
}
