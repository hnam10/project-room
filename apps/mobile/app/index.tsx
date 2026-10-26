import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { clerkPublishableKey } from '@/src/config';
import { colors } from '@/src/theme';

export default function Index() {
  if (!clerkPublishableKey) return <Redirect href="/setup" />;
  return <SignedInGate />;
}

function SignedInGate() {
  const { isSignedIn, isLoaded, orgId } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!orgId) return <Redirect href="/choose-team" />;
  return <Redirect href="/(workspace)/(tabs)/assistant" />;
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
