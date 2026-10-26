import type { TaskStatus } from '@project-room/shared';
import { StyleSheet, Text, View } from 'react-native';
import type { TaskStatusCounts } from '../features/workspaceSummary';
import { colors, radius, statusColor } from '../theme';

const chips: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: 'To do' },
  { key: 'progress', label: 'In progress' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done' },
];

export function TaskSummaryStrip({ counts, dueLine }: { counts: TaskStatusCounts; dueLine?: string }) {
  const total = counts.todo + counts.progress + counts.review + counts.done;
  if (!total) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Your workload</Text>
      {dueLine ? <Text style={styles.due}>{dueLine}</Text> : null}
      <View style={styles.row}>
        {chips.map(({ key, label }) =>
          counts[key] > 0 ? (
            <View key={key} style={styles.chip}>
              <View style={[styles.dot, { backgroundColor: statusColor[key] }]} />
              <Text style={styles.chipText}>
                {counts[key]} {label.toLowerCase()}
              </Text>
            </View>
          ) : null,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { fontSize: 14, fontWeight: '600', color: colors.ink },
  due: { marginTop: 4, fontSize: 12, color: colors.red, fontWeight: '500' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 12, color: colors.ink2, fontWeight: '500' },
});
