import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, space, tap } from './theme';

/** One sentence and, at most, one way forward. Used for empty lists and recoverable errors. */
export default function EmptyState({ text, action, onAction, alert }: { text: string; action?: string; onAction?: () => void; alert?: boolean }) {
  return (
    <View style={styles.box}>
      <Text accessibilityRole={alert ? 'alert' : undefined} style={styles.text}>{text}</Text>
      {action && onAction && <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
        <Text style={styles.actionText}>{action}</Text>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: space.m },
  text: { fontSize: 14, lineHeight: 21, color: color.muted, fontFamily: font.text },
  action: { minHeight: tap, justifyContent: 'center', alignSelf: 'flex-start' },
  actionText: { fontSize: 14, color: color.ink, fontFamily: font.text, textDecorationLine: 'underline' },
  pressed: { opacity: 0.55 },
});
