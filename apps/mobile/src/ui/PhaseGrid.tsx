import { StyleSheet, Text, View } from 'react-native';
import type { CubePhaseDefinition } from '@scenarys/shared';
import { color, font } from './theme';

// Labels without the contract's `:string` suffix; generated defaults show as c1 / fila 1.
const plain = (label: string, fallback: string) => /^(col|fila)\d+:string$/.test(label) ? fallback : label.replace(/:string$/, '');

/** One phase as it is played: circles with its column and row labels; the last choice, if any, in green. */
export default function PhaseGrid({ phase, chosen }: { phase: CubePhaseDefinition; chosen?: { row: number; column: number } }) {
  const size = Math.max(12, Math.min(28, 180 / Math.max(phase.columns.length, phase.rows.length)));
  return (
    <View accessible accessibilityLabel={`${phase.columns.length} columnas por ${phase.rows.length} filas${chosen ? `; última elección fila ${chosen.row}, columna ${chosen.column}` : ''}`}>
      <View style={[styles.row, { marginLeft: 84 }]}>
        {phase.columns.map((label, c) => <Text key={c} numberOfLines={1} style={[styles.top, { width: size + 6 }]}>{plain(label, `c${c + 1}`)}</Text>)}
      </View>
      {phase.rows.map((rowLabel, r) => <View key={r} style={styles.row}>
        <Text numberOfLines={1} style={styles.left}>{plain(rowLabel, `fila ${r + 1}`)}</Text>
        {phase.columns.map((_, c) => {
          const on = chosen?.row === r + 1 && chosen?.column === c + 1;
          return <View key={c} style={[styles.dot, { width: size, height: size }, on && styles.on]} />;
        })}
      </View>)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  top: { fontSize: 9, color: color.muted, fontFamily: font.mono, textAlign: 'center' },
  left: { width: 84, fontSize: 10, color: color.muted, fontFamily: font.mono, paddingRight: 6, textAlign: 'right' },
  dot: { borderRadius: 999, backgroundColor: color.ink, margin: 3 },
  on: { backgroundColor: color.axis, borderWidth: 2, borderColor: color.ink },
});
