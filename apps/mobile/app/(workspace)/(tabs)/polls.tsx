import { FlatList, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '@/src/components/EmptyState';
import { PollCard } from '@/src/components/PollCard';
import { openPolls, sortedPolls } from '@/src/features/workspaceSummary';
import { useWorkspace } from '@/src/state/workspace';
import { colors } from '@/src/theme';

export default function PollsScreen() {
  const { snapshot, error } = useWorkspace();
  const polls = snapshot ? sortedPolls(snapshot) : [];
  const openCount = snapshot ? openPolls(snapshot).length : 0;

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Can’t load project</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={polls}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        openCount > 0 ? (
          <Text style={styles.lead}>{openCount} open poll{openCount === 1 ? '' : 's'} — tap an option to vote.</Text>
        ) : (
          <Text style={styles.lead}>Polls opened in meetings appear here. Closed polls stay for the record.</Text>
        )
      }
      ListEmptyComponent={
        <EmptyState
          title="No polls yet"
          body="Start a meeting on the web and open a poll, or approve a poll suggestion from the Assistant tab."
        />
      }
      renderItem={({ item }) => <PollCard poll={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 14, backgroundColor: colors.bg, flexGrow: 1 },
  lead: { fontSize: 13, lineHeight: 19, color: colors.ink2, marginBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  muted: { color: colors.muted, fontSize: 13 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: colors.ink, marginBottom: 8 },
  errorBody: { textAlign: 'center', color: colors.muted, lineHeight: 20, fontSize: 13 },
});
