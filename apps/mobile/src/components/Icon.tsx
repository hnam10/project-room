import { SymbolView } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { colors } from '../theme';

const names = {
  chevronDown: { ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' },
  account: { ios: 'person.circle', android: 'account_circle', web: 'account_circle' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' },
  chat: { ios: 'bubble.left.and.bubble.right', android: 'chat', web: 'chat' },
  tasks: { ios: 'checklist', android: 'checklist', web: 'checklist' },
  poll: { ios: 'chart.bar', android: 'poll', web: 'poll' },
} as const;

export function Icon({ name, size = 22, color = colors.ink2 }: { name: keyof typeof names; size?: number; color?: ColorValue }) {
  return <SymbolView name={names[name]} size={size} tintColor={color} />;
}
