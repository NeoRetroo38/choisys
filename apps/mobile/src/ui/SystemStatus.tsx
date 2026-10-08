import { StyleSheet, Text, View } from 'react-native';
import { color, font, space } from './theme';

export interface ServiceState { name: string; state: 'ok' | 'down' | 'checking'; detail?: string }

const dot = { ok: color.axis, down: color.past, checking: color.faint } as const;
const word = { ok: 'ok', down: 'caído', checking: '…' } as const;

/** Services as a few mono lines. Only what the API actually reports; nothing is guessed. */
export default function SystemStatus({ services }: { services: ServiceState[] }) {
  return (
    <View accessibilityLabel="Estado del sistema">
      {services.map(service => (
        <View key={service.name} style={styles.row} accessibilityLabel={`${service.name}: ${word[service.state]}`}>
          <View style={[styles.dot, { backgroundColor: dot[service.state] }]} />
          <Text style={styles.name}>{service.name}</Text>
          <Text style={styles.detail}>{service.detail ?? word[service.state]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: space.xs },
  dot: { width: 7, height: 7, borderRadius: 7 },
  name: { fontFamily: font.mono, fontSize: 13, color: color.ink, flex: 1 },
  detail: { fontFamily: font.mono, fontSize: 12, color: color.muted },
});
