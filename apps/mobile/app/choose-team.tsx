import { useAuth, useClerk, useOrganizationList } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '@/src/components/Icon';
import { colors, radius } from '@/src/theme';

export default function ChooseTeamScreen() {
  const router = useRouter();
  const { isLoaded: authLoaded, orgId } = useAuth();
  const { setActive } = useClerk();
  const { isLoaded, userMemberships } = useOrganizationList({ userMemberships: { infinite: true } });

  if (!authLoaded || !isLoaded) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const teams = userMemberships.data ?? [];
  const canCancel = Boolean(orgId);

  const openProject = async (organizationId: string) => {
    if (organizationId === orgId) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    await setActive?.({ organization: organizationId });
    router.replace('/');
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{orgId ? 'Switch project' : 'Choose a project'}</Text>
      <Text style={styles.sub}>Each Clerk organization is a Project Room project.</Text>
      <FlatList
        data={teams}
        keyExtractor={(item) => item.organization.id}
        ListEmptyComponent={<Text style={styles.empty}>No teams yet. Create one in the web app.</Text>}
        renderItem={({ item }) => {
          const current = item.organization.id === orgId;
          return (
            <Pressable style={[styles.row, current && styles.rowCurrent]} onPress={() => void openProject(item.organization.id)}>
              <Text style={styles.rowTitle}>{item.organization.name}</Text>
              {current ? <Icon name="check" size={18} color={colors.accent} /> : null}
            </Pressable>
          );
        }}
      />
      {canCancel ? (
        <Pressable
          style={styles.cancel}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, backgroundColor: colors.bg },
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  title: { fontSize: 20, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 14, color: colors.muted, marginBottom: 16, marginTop: 4 },
  empty: { color: colors.muted, marginTop: 24, textAlign: 'center', fontSize: 13 },
  row: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: radius.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowCurrent: { borderColor: colors.accent, backgroundColor: colors.accentWeak },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  cancel: { paddingVertical: 14, alignItems: 'center' },
  cancelLabel: { fontSize: 14, fontWeight: '500', color: colors.muted },
});
