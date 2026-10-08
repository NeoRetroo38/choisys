import { StyleSheet, Text, View } from 'react-native';
import { roleLabel } from '../account/capabilities';
import { color, font, space } from './theme';

/** One role change: when, who, from → to. Readable on a phone without a table. */
export default function AuditRow({ at, actor, target, from, to, reason }: { at: string; actor: string; target: string; from: string | null; to: string; reason?: string | null }) {
  const when = new Date(at).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <View style={styles.row} accessibilityLabel={`${when}: ${actor} cambió a ${target} ${from ? `de ${from} ` : ''}a ${to}`}>
      <Text style={styles.change}>{from ? `${roleLabel[from] ?? from} → ` : 'alta · '}{roleLabel[to] ?? to}</Text>
      <Text style={styles.who} numberOfLines={1}>{target} · por {actor} · {when}</Text>
      {reason && <Text style={styles.who}>{reason}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.s, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  change: { fontFamily: font.mono, fontSize: 13, color: color.ink },
  who: { fontFamily: font.text, fontSize: 12, color: color.muted, marginTop: 2 },
});
