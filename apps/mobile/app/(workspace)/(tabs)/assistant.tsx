import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { AssistantHome } from '@/src/components/AssistantHome';
import { EmptyState } from '@/src/components/EmptyState';
import { SuggestionCard } from '@/src/components/SuggestionCard';
import { pendingAssistantSuggestions } from '@/src/features/assistantSuggestions';
import { useWorkspace } from '@/src/state/workspace';
import { colors } from '@/src/theme';

const PREVIEW_COUNT = 2;

export default function AssistantScreen() {
  const router = useRouter();
  const { snapshot, error } = useWorkspace();
  const pending = snapshot ? pendingAssistantSuggestions(snapshot.suggestions, snapshot.ideas) : [];
  const rest = pending.slice(PREVIEW_COUNT);
  const preview = pending.slice(0, PREVIEW_COUNT);

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
      data={rest}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<AssistantHome snapshot={snapshot} preview={preview} />}
      ListEmptyComponent={
        pending.length === 0 ? (
          <EmptyState
            title="You’re all caught up"
            body="When the team chats or @AI runs, new suggestions land here for you to approve or dismiss."
            actionLabel="Open chat"
            onAction={() => router.push('/(workspace)/(tabs)/chat')}
          />
        ) : null
      }
      renderItem={({ item }) => <SuggestionCard suggestion={item} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 14, backgroundColor: colors.bg, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  muted: { color: colors.muted, fontSize: 13 },
  errorTitle: { fontSize: 16, fontWeight: '600', color: colors.ink, marginBottom: 8 },
  errorBody: { textAlign: 'center', color: colors.muted, lineHeight: 20, fontSize: 13 },
});
