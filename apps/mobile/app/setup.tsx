import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/src/theme';

export default function SetupScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Sign-in isn’t configured</Text>
      <Text style={styles.body}>
        Copy <Text style={styles.code}>apps/mobile/.env.example</Text> to <Text style={styles.code}>.env</Text> and set{' '}
        <Text style={styles.code}>EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY</Text> (same value as the web app). Restart Expo after changing env
        vars.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink2 },
  code: { fontFamily: 'monospace', color: colors.ink },
});
