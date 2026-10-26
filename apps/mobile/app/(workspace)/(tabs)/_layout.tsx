import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountMenuButton } from '@/src/components/AccountMenu';
import { Icon } from '@/src/components/Icon';
import { openPolls, pendingSuggestionCount } from '@/src/features/workspaceSummary';
import { syncAppBadge } from '@/src/push';
import { useWorkspace } from '@/src/state/workspace';
import { colors } from '@/src/theme';

function ProjectSwitcherTitle({ name, offline, pollsOpen }: { name: string; offline: boolean; pollsOpen: number }) {
  const router = useRouter();
  const label = offline ? `${name} (offline)` : name;
  return (
    <Pressable
      onPress={() => router.push('/choose-team')}
      accessibilityRole="button"
      accessibilityLabel={`Current project ${label}. Switch project`}
      style={styles.titleHit}
    >
      <View style={styles.titleCol}>
        <Text numberOfLines={1} style={styles.title}>
          {label}
        </Text>
        {pollsOpen > 0 ? (
          <Pressable onPress={() => router.push('/(workspace)/(tabs)/polls')} hitSlop={6}>
            <Text style={styles.pollHint}>{pollsOpen} open poll{pollsOpen === 1 ? '' : 's'}</Text>
          </Pressable>
        ) : null}
      </View>
      <Icon name="chevronDown" size={14} color={colors.muted} />
    </Pressable>
  );
}

export default function TabLayout() {
  const { snapshot, connection } = useWorkspace();
  const name = snapshot?.project.name ?? 'Project Room';
  const pending = snapshot ? pendingSuggestionCount(snapshot) : 0;
  const pollsOpen = snapshot ? openPolls(snapshot).length : 0;

  useEffect(() => {
    void syncAppBadge(pending);
  }, [pending]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.ink2,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontWeight: '500', fontSize: 11 },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerTitle: () => <ProjectSwitcherTitle name={name} offline={connection === 'offline'} pollsOpen={pollsOpen} />,
        headerRight: () => <AccountMenuButton />,
      }}
    >
      <Tabs.Screen
        name="assistant"
        options={{
          title: 'Assistant',
          tabBarLabel: 'Assistant',
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarIcon: ({ color, size }) => <Icon name="sparkle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarLabel: 'Chat',
          tabBarIcon: ({ color, size }) => <Icon name="chat" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'My tasks',
          tabBarLabel: 'Tasks',
          tabBarIcon: ({ color, size }) => <Icon name="tasks" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="polls"
        options={{
          title: 'Polls',
          tabBarLabel: 'Polls',
          tabBarBadge: pollsOpen > 0 ? pollsOpen : undefined,
          tabBarIcon: ({ color, size }) => <Icon name="poll" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  titleHit: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 240 },
  titleCol: { flexShrink: 1 },
  title: { fontSize: 15, fontWeight: '700', color: colors.ink },
  pollHint: { fontSize: 11, fontWeight: '600', color: colors.green, marginTop: 1 },
});
