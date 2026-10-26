import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.btn} onPress={onAction} accessibilityRole="button">
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 20, marginTop: 32, gap: 8 },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: 'center' },
  btn: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  btnText: { color: colors.white, fontWeight: '600', fontSize: 13 },
});
