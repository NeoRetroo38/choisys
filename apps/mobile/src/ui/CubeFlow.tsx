import { StyleSheet, Text, View } from 'react-native';
import { color, font, space } from './theme';

export interface FlowStep { label: string; done: boolean }

/** Where this cube is in its life: created → played → reference published → people answered. Read from the detail as sent. */
export default function CubeFlow({ steps }: { steps: FlowStep[] }) {
  const next = steps.findIndex(step => !step.done);
  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Progreso: ${steps.map(s => `${s.label} ${s.done ? 'hecho' : 'pendiente'}`).join(', ')}`}>
      {steps.map((step, i) => <View key={step.label} style={styles.step}>
        <View style={styles.track}>
          <View style={[styles.line, i === 0 && styles.hidden, (step.done || i === next) && styles.lineOn]} />
          <View style={[styles.dot, step.done && styles.dotDone, i === next && styles.dotNext]} />
          <View style={[styles.line, i === steps.length - 1 && styles.hidden, step.done && styles.lineOn]} />
        </View>
        <Text style={[styles.label, (step.done || i === next) && styles.labelOn]}>{step.label}</Text>
      </View>)}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', marginBottom: space.l },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  track: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  line: { flex: 1, height: 2, backgroundColor: color.line },
  lineOn: { backgroundColor: color.ink },
  hidden: { opacity: 0 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: color.faint, backgroundColor: color.paper },
  dotDone: { backgroundColor: color.ink, borderColor: color.ink },
  dotNext: { borderColor: color.ink, borderWidth: 2, backgroundColor: color.axis },
  label: { fontSize: 11, color: color.faint, fontFamily: font.mono, textAlign: 'center' },
  labelOn: { color: color.ink },
});
