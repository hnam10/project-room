import { useAuth } from '@clerk/clerk-expo';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Poll } from '@project-room/shared';
import { api } from '../api/client';
import { useWorkspace } from '../state/workspace';
import { colors, radius, shadow } from '../theme';

export function PollCard({ poll }: { poll: Poll }) {
  const { userId } = useAuth();
  const { projectId, applyRecord } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const open = poll.status === 'open';
  const total = poll.options.reduce((n, option) => n + option.voterIds.length, 0);
  const most = Math.max(0, ...poll.options.map((option) => option.voterIds.length));

  const vote = async (optionId: string) => {
    if (!open || busy) return;
    setBusy(true);
    try {
      const updated = await api.votePoll(projectId, poll.id, optionId);
      applyRecord('poll', updated);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    Alert.alert('Close poll', 'Stop collecting votes on this poll?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close poll',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          void api
            .closePoll(projectId, poll.id)
            .then((updated) => applyRecord('poll', updated))
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.question}>{poll.question}</Text>
      {poll.options.map((option) => {
        const mine = userId ? option.voterIds.includes(userId) : false;
        const winner = !open && most > 0 && option.voterIds.length === most;
        const width = total ? (option.voterIds.length / total) * 100 : 0;
        return (
          <Pressable
            key={option.id}
            style={[styles.option, mine && styles.optionMine, winner && styles.optionWinner]}
            disabled={!open || busy}
            onPress={() => void vote(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: mine, disabled: !open || busy }}
          >
            <View style={[styles.bar, { width: `${width}%` }]} />
            <Text style={styles.optionLabel}>{option.label}</Text>
            <Text style={styles.optionCount}>{option.voterIds.length}</Text>
          </Pressable>
        );
      })}
      {open ? (
        <Pressable style={styles.close} disabled={busy} onPress={close}>
          <Text style={styles.closeText}>Close poll</Text>
        </Pressable>
      ) : (
        <Text style={styles.closedMeta}>
          Closed · {total} vote{total === 1 ? '' : 's'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 12,
    ...shadow.card,
  },
  question: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 10, lineHeight: 21 },
  option: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionMine: { borderColor: colors.green, backgroundColor: colors.greenWeak },
  optionWinner: { borderColor: colors.green },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.greenWeak,
    opacity: 0.65,
  },
  optionLabel: { flex: 1, fontSize: 14, color: colors.ink, zIndex: 1 },
  optionCount: { fontSize: 13, fontWeight: '600', color: colors.ink2, zIndex: 1 },
  close: { alignSelf: 'flex-start', marginTop: 4, paddingVertical: 6 },
  closeText: { fontSize: 13, fontWeight: '600', color: colors.green },
  closedMeta: { marginTop: 4, fontSize: 12, color: colors.muted },
});
