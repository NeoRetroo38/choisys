import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color, font, space } from './theme';

/** A quiet label and its rows. No card, no border: space does the grouping. */
export default function Section({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      {label && <Text accessibilityRole="header" style={styles.label}>{label}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: space.l },
  label: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: color.muted, fontFamily: font.text, marginBottom: space.xs },
});
