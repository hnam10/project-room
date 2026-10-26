import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { bindClerkGetToken, clearClerkGetToken } from '@/src/api/auth';
import { onNotificationOpen, registerPushToken } from '@/src/push';
import { WorkspaceProvider } from '@/src/state/workspace';
import { colors } from '@/src/theme';

export default function WorkspaceLayout() {
  const router = useRouter();
  const { isSignedIn, isLoaded, orgId, userId, getToken } = useAuth();

  // Bind before the workspace's effects. Those effects run first and load the project.
  if (getToken) bindClerkGetToken(getToken);

  useEffect(() => () => clearClerkGetToken(), []);

  useEffect(() => {
    if (!isSignedIn) return;
    const registration = new AbortController();
    void registerPushToken(registration.signal).catch(() => undefined);
    return () => registration.abort();
  }, [isSignedIn, userId]);

  useEffect(() => {
    if (!isSignedIn) return;
    return onNotificationOpen(() => router.replace('/(workspace)/(tabs)/assistant'));
  }, [isSignedIn, router]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!orgId) return <Redirect href="/choose-team" />;

  return (
    <WorkspaceProvider key={orgId} projectId={orgId}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </WorkspaceProvider>
  );
}
