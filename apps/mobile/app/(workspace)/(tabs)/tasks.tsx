import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Task, TaskStatus } from '@project-room/shared';
import { TASK_STATUSES } from '@project-room/shared';
import { api } from '@/src/api/client';
import { EmptyState } from '@/src/components/EmptyState';
import { TaskSummaryStrip } from '@/src/components/TaskSummaryStrip';
import { formatDueDate, myTaskStatusCounts, myTasksDueSoon, taskDueUrgency } from '@/src/features/workspaceSummary';
import { useWorkspace } from '@/src/state/workspace';
import { colors, priorityColor, radius, shadow, statusColor } from '@/src/theme';

const statusLabel: Record<TaskStatus, string> = {
  todo: 'To Do',
  progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

export default function TasksScreen() {
  const router = useRouter();
  const { userId } = useAuth();
  const { projectId, snapshot, applyRecord } = useWorkspace();

  const mine =
    snapshot?.tasks.filter((task) => task.assigneeId === userId).sort((a, b) => a.title.localeCompare(b.title)) ?? [];
  const counts = myTaskStatusCounts(snapshot?.tasks ?? [], userId);
  const dueSoon = myTasksDueSoon(snapshot?.tasks ?? [], userId);
  const dueLine = buildDueLine(dueSoon);

  const advance = async (task: Task) => {
    const index = TASK_STATUSES.indexOf(task.status);
    const next = TASK_STATUSES[Math.min(index + 1, TASK_STATUSES.length - 1)];
    if (next === task.status) return;
    const updated = await api.updateTask(projectId, task.id, { status: next });
    applyRecord('task', updated);
  };

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={mine}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<TaskSummaryStrip counts={counts} dueLine={dueLine} />}
      ListEmptyComponent={
        <EmptyState
          title="No tasks assigned to you"
          body="Ask a teammate to assign work on the web board, or mention @AI in chat to draft action items."
          actionLabel="Open chat"
          onAction={() => router.push('/(workspace)/(tabs)/chat')}
        />
      }
      renderItem={({ item }) => {
        const next = TASK_STATUSES[Math.min(TASK_STATUSES.indexOf(item.status) + 1, TASK_STATUSES.length - 1)]!;
        const urgency = taskDueUrgency(item);
        return (
          <View style={styles.card}>
            <View style={[styles.statusBar, { backgroundColor: statusColor[item.status] }]} />
            <View style={styles.body}>
              <View style={styles.head}>
                <Text style={[styles.title, item.status === 'done' && styles.doneTitle]}>{item.title}</Text>
                <Text style={styles.num}>#{item.num}</Text>
              </View>
              <View style={styles.tags}>
                <Text style={[styles.tag, { color: statusColor[item.status] }]}>{statusLabel[item.status]}</Text>
                <Text style={[styles.tag, { color: priorityColor[item.priority] }]}>{item.priority} priority</Text>
                {item.dueDate ? (
                  <Text style={[styles.tag, urgency === 'overdue' && styles.overdue]}>Due {formatDueDate(item.dueDate)}</Text>
                ) : null}
              </View>
              {item.status !== 'done' ? (
                <Pressable style={styles.btn} onPress={() => void advance(item)}>
                  <Text style={styles.btnText}>Move to {statusLabel[next]}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}

function buildDueLine(tasks: Task[]): string | undefined {
  if (!tasks.length) return undefined;
  const overdue = tasks.filter((task) => taskDueUrgency(task) === 'overdue').length;
  const today = tasks.filter((task) => taskDueUrgency(task) === 'today').length;
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} overdue`);
  if (today) parts.push(`${today} due today`);
  if (!parts.length) parts.push(`${tasks.length} due within a week`);
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  list: { padding: 16, backgroundColor: colors.bg, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadow.card,
  },
  statusBar: { width: 3 },
  body: { flex: 1, padding: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink, lineHeight: 19 },
  doneTitle: { color: colors.ink2 },
  num: { color: colors.muted, fontSize: 11.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tag: { fontSize: 12, fontWeight: '500' },
  overdue: { color: colors.red },
  btn: {
    alignSelf: 'flex-start',
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    justifyContent: 'center',
  },
  btnText: { color: colors.white, fontWeight: '500', fontSize: 12 },
});
