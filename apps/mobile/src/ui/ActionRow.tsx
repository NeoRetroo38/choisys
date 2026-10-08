import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, space, tap } from './theme';

interface ActionRowProps {
  label: string;
  /** Right-hand value, e.g. a name or a count. */
  value?: string | ReactNode;
  detail?: string;
  onPress?: () => void;
  busy?: boolean;
  tone?: 'default' | 'danger';
  accessibilityHint?: string;
}

/** One line, one meaning. Pressable only when it does something. */
export default function ActionRow({ label, value, detail, onPress, busy, tone = 'default', accessibilityHint }: ActionRowProps) {
  const body = (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[styles.label, tone === 'danger' && styles.danger]}>{label}</Text>
        {detail && <Text style={styles.detail}>{detail}</Text>}
      </View>
      {busy ? <ActivityIndicator size="small" color={color.ink} /> :
        typeof value === 'string' ? <Text numberOfLines={1} style={styles.value}>{value}</Text> : value}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: !!busy, disabled: !!busy }} disabled={busy} onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: tap + 8, flexDirection: 'row', alignItems: 'center', gap: space.s, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line, paddingVertical: space.xs },
  text: { flex: 1 },
  label: { fontSize: 16, color: color.ink, fontFamily: font.text, fontWeight: '300' },
  danger: { color: color.danger },
  detail: { fontSize: 12, color: color.muted, fontFamily: font.text, marginTop: 2 },
  value: { fontSize: 14, color: color.muted, fontFamily: font.text, maxWidth: '55%' },
  pressed: { opacity: 0.55 },
});
