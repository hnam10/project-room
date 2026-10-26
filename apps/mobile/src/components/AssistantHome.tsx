import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Suggestion, WorkspaceSnapshot } from '@project-room/shared';
import { openPolls, pendingSuggestionCount } from '../features/workspaceSummary';
import { colors, radius, shadow } from '../theme';
import { SuggestionCard } from './SuggestionCard';

export function AssistantHome({
  snapshot,
  preview,
}: {
  snapshot: WorkspaceSnapshot;
  preview: Suggestion[];
}) {
  const router = useRouter();
  const pending = pendingSuggestionCount(snapshot);
  const pollsOpen = openPolls(snapshot).length;

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Project pulse</Text>
        <Text style={styles.heroSub}>
          {pending > 0
            ? `${pending} AI suggestion${pending === 1 ? '' : 's'} waiting for you`
            : 'No pending AI suggestions right now'}
        </Text>
        <View style={styles.stats}>
          <Stat label="Review" value={String(pending)} accent={pending > 0} />
          <Stat label="Open polls" value={String(pollsOpen)} accent={pollsOpen > 0} />
          <Stat label="Channels" value={String(snapshot.channels.length)} />
        </View>
      </View>

      <View style={styles.quick}>
        <QuickBtn label="Open chat" onPress={() => router.push('/(workspace)/(tabs)/chat')} />
        <QuickBtn label="My tasks" onPress={() => router.push('/(workspace)/(tabs)/tasks')} />
        {pollsOpen > 0 ? <QuickBtn label="Vote in polls" onPress={() => router.push('/(workspace)/(tabs)/polls')} /> : null}
      </View>

      {preview.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Review next</Text>
          {preview.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[styles.stat, accent && styles.statAccent]}>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuickBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickBtn} onPress={onPress} accessibilityRole="button">
      <Text style={styles.quickBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, gap: 12 },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    ...shadow.card,
  },
  heroTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  heroSub: { marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.ink2 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statAccent: { backgroundColor: colors.accentWeak },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.ink },
  statValueAccent: { color: colors.accent },
  statLabel: { marginTop: 2, fontSize: 11, color: colors.muted, fontWeight: '500' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.accentWeak,
    borderWidth: 1,
    borderColor: colors.line,
  },
  quickBtnText: { fontSize: 13, fontWeight: '600', color: colors.accent },
  section: { gap: 0 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
});
