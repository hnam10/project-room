import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { clearAppBadge, unregisterPushToken } from '../push';
import { colors } from '../theme';
import { Icon } from './Icon';

export function AccountMenuButton() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Account';
  const email = user?.primaryEmailAddress?.emailAddress;
  const photo = user?.imageUrl;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Account menu" style={styles.hit}>
        {photo ? <Image source={{ uri: photo }} style={styles.avatar} /> : <Icon name="account" size={26} color={colors.ink2} />}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.name}>{name}</Text>
            {email && email !== name ? <Text style={styles.email}>{email}</Text> : null}
            <Pressable
              style={styles.row}
              onPress={() => {
                setOpen(false);
                router.push('/choose-team');
              }}
            >
              <Text style={styles.rowLabel}>Switch project</Text>
            </Pressable>
            <Pressable
              style={styles.row}
              onPress={() => {
                setOpen(false);
                void Promise.all([unregisterPushToken(), clearAppBadge()]).finally(() => signOut());
              }}
            >
              <Text style={[styles.rowLabel, styles.signOut]}>Sign out</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setOpen(false)}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hit: { marginRight: 12, padding: 4 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface2 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 24, 40, 0.35)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingTop: 16,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  email: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 8 },
  row: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.line },
  rowLabel: { fontSize: 15, fontWeight: '500', color: colors.ink },
  signOut: { color: colors.red },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelLabel: { fontSize: 14, color: colors.muted, fontWeight: '500' },
});
