import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { readStrategyPlan, type IdeaDraft, type StrategyPlan, type Suggestion } from '@project-room/shared';
import { api } from '../api/client';
import { useWorkspace } from '../state/workspace';
import { colors, radius } from '../theme';

const kindLabel: Record<string, string> = {
  risk: 'Deadline risk',
  idea: 'Idea draft',
  brainstorm_topic: 'New topic',
  brainstorm_analysis: 'Research',
  action_items: 'Action items',
  poll: 'Poll',
  meeting_notes: 'Meeting notes',
};

function suggestionRole(suggestion: Suggestion): { border: string; badge: string; approveBg: string; approveText: string } {
  if (suggestion.kind === 'brainstorm_analysis') {
    return { border: colors.research, badge: colors.research, approveBg: colors.research, approveText: colors.white };
  }
  if (suggestion.kind === 'poll') {
    return { border: colors.green, badge: colors.green, approveBg: colors.green, approveText: colors.white };
  }
  if (suggestion.kind === 'idea' && suggestion.ideaDraft?.theme === 'Strategy') {
    return { border: colors.direction, badge: colors.direction, approveBg: colors.direction, approveText: colors.white };
  }
  if (suggestion.kind === 'idea' || suggestion.kind === 'brainstorm_topic') {
    return { border: colors.amber, badge: colors.brainstorm, approveBg: colors.amber, approveText: colors.ideaOnAmber };
  }
  if (suggestion.kind === 'risk') {
    return { border: colors.accent, badge: colors.red, approveBg: colors.accent, approveText: colors.white };
  }
  return { border: colors.accent, badge: colors.accent, approveBg: colors.accent, approveText: colors.white };
}

function planFromDescription(description: string): StrategyPlan {
  return readStrategyPlan(description) ?? { recommendation: '', steps: [''], essentialScope: '' };
}

export function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const { projectId, members, snapshot, applyRecord, reload } = useWorkspace();
  const [assigneeId, setAssigneeId] = useState('');
  const [busy, setBusy] = useState(false);
  const role = suggestionRole(suggestion);
  const draft = suggestion.ideaDraft;
  const [form, setForm] = useState<IdeaDraft>(draft ?? { title: suggestion.title, description: '', theme: 'Option' });
  const [plan, setPlan] = useState<StrategyPlan>(() => planFromDescription(draft?.description ?? ''));

  const topics = snapshot?.ideas.filter((idea) => idea.kind === 'problem') ?? [];
  const [topicId, setTopicId] = useState(suggestion.topicId ?? (topics.length === 1 ? topics[0]!.id : ''));
  const needsTopic = (suggestion.kind === 'idea' || suggestion.kind === 'brainstorm_topic') && !suggestion.ideaId && topics.length > 0;
  const strategy = Boolean(draft && form.theme === 'Strategy');

  const persistDraft = async () => {
    if (!draft) return;
    const ideaDraft = strategy
      ? { ...form, description: JSON.stringify({ ...plan, steps: plan.steps.filter((step) => step.trim()) }, null, 2) }
      : form;
    applyRecord('suggestion', await api.updateSuggestion(projectId, suggestion.id, { ideaDraft }));
  };

  const dismiss = async () => {
    setBusy(true);
    try {
      applyRecord('suggestion', await api.dismissSuggestion(projectId, suggestion.id));
    } catch (error) {
      Alert.alert('Could not dismiss', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (suggestion.kind === 'risk' && !assigneeId) {
      Alert.alert('Choose an owner', 'Pick who should own this follow-up.');
      return;
    }
    if (needsTopic && !topicId) {
      Alert.alert('Choose a topic', 'Pick which brainstorm board this belongs on.');
      return;
    }
    setBusy(true);
    try {
      await persistDraft();
      const approved = await api.approveSuggestion(
        projectId,
        suggestion.id,
        suggestion.kind === 'risk' ? { assigneeId } : topicId ? { topicId } : {},
      );
      applyRecord('suggestion', approved);
      reload();
    } catch (error) {
      Alert.alert('Could not approve', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const title = form.title || suggestion.title || (suggestion.kind === 'brainstorm_topic' ? 'New brainstorm topic' : 'AI suggestion');

  return (
    <View style={[styles.card, { borderColor: role.border }]}>
      <Text style={[styles.badge, { color: role.badge }]}>{kindLabel[suggestion.kind] ?? suggestion.kind}</Text>
      {draft ? (
        <TextInput
          style={styles.titleInput}
          value={form.title}
          onChangeText={(title) => setForm((current) => ({ ...current, title }))}
          placeholder="Title"
          placeholderTextColor={colors.muted}
        />
      ) : (
        <Text style={styles.title}>{title}</Text>
      )}
      <Text style={styles.reason}>
        <Text style={styles.why}>Why: </Text>
        {suggestion.reason}
      </Text>
      {suggestion.quote ? (
        <View style={styles.quoteBlock}>
          <Text style={styles.quote}>“{suggestion.quote}”</Text>
          {suggestion.cite ? <Text style={styles.cite}>{suggestion.cite}</Text> : null}
        </View>
      ) : null}

      {draft && strategy ? (
        <View style={styles.edit}>
          <Text style={styles.fieldLabel}>Recommended direction</Text>
          <TextInput
            style={styles.multiline}
            multiline
            value={plan.recommendation}
            onChangeText={(recommendation) => setPlan((current) => ({ ...current, recommendation }))}
          />
          {plan.steps.map((step, index) => (
            <View key={index}>
              <Text style={styles.fieldLabel}>Step {index + 1}</Text>
              <TextInput
                style={styles.multiline}
                multiline
                value={step}
                onChangeText={(value) =>
                  setPlan((current) => ({
                    ...current,
                    steps: current.steps.map((item, position) => (position === index ? value : item)),
                  }))
                }
              />
            </View>
          ))}
          <Text style={styles.fieldLabel}>Essential scope</Text>
          <TextInput
            style={styles.multiline}
            multiline
            value={plan.essentialScope}
            onChangeText={(essentialScope) => setPlan((current) => ({ ...current, essentialScope }))}
          />
        </View>
      ) : null}

      {draft && !strategy ? (
        <View style={styles.edit}>
          <Text style={styles.fieldLabel}>Details</Text>
          <TextInput
            style={styles.multiline}
            multiline
            value={form.description}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
            placeholder="Optional description"
            placeholderTextColor={colors.muted}
          />
        </View>
      ) : null}

      {needsTopic ? (
        <View style={styles.row}>
          {topics.map((topic) => (
            <Pressable key={topic.id} style={[styles.chip, topicId === topic.id && styles.chipActive]} onPress={() => setTopicId(topic.id)}>
              <Text style={[styles.chipText, topicId === topic.id && styles.chipTextActive]}>{topic.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {suggestion.kind === 'risk' ? (
        <View style={styles.row}>
          {[...members.values()].map((member) => (
            <Pressable
              key={member.id}
              style={[styles.chip, assigneeId === member.id && styles.chipActive]}
              onPress={() => setAssigneeId(member.id)}
            >
              <Text style={[styles.chipText, assigneeId === member.id && styles.chipTextActive]}>{member.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, { backgroundColor: role.approveBg, borderColor: role.approveBg }, busy && styles.disabled]}
          disabled={busy}
          onPress={() => void approve()}
        >
          <Text style={[styles.approveText, { color: role.approveText }]}>Approve</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.dismiss, busy && styles.disabled]} disabled={busy} onPress={() => void dismiss()}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  badge: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, marginBottom: 4, textTransform: 'uppercase' },
  title: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 6 },
  titleInput: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  reason: { fontSize: 13, color: colors.ink2, lineHeight: 19, marginBottom: 8 },
  why: { fontWeight: '600', color: colors.ink },
  quoteBlock: {
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.lineStrong,
    backgroundColor: colors.bg,
    borderRadius: 6,
  },
  quote: { fontSize: 13, color: colors.ink2, fontStyle: 'italic' },
  cite: { marginTop: 2, fontSize: 11.5, color: colors.muted, fontStyle: 'normal' },
  edit: { gap: 6, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: colors.ink2 },
  multiline: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.bg,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.accentWeak, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.ink },
  chipTextActive: { color: colors.accent },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  btn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveText: { fontWeight: '500', fontSize: 13 },
  dismiss: { backgroundColor: colors.surface, borderColor: 'transparent' },
  dismissText: { color: colors.red, fontWeight: '500', fontSize: 13 },
  disabled: { opacity: 0.6 },
});
