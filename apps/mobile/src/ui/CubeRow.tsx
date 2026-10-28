import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import type { CubeSummary } from '@scenarys/shared';
import { cubeStatus, shapeLine, statusLine } from '../cubes/cubeStatus';
import { color, font, space, tap } from './theme';

// Small wireframe cube: green dot = published reference, faint = archived.
const corners = { a: [6, 12], b: [22, 6], c: [38, 12], d: [22, 18], e: [6, 30], f: [22, 36], g: [38, 30], h: [22, 24] } as const;
const edges: Array<[keyof typeof corners, keyof typeof corners]> = [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], ['a', 'e'], ['c', 'g'], ['d', 'f'], ['e', 'f'], ['f', 'g'], ['b', 'h'], ['h', 'e'], ['h', 'g']];

function Glyph({ status }: { status: ReturnType<typeof cubeStatus> }) {
  const stroke = status === 'archivado' ? color.faint : color.ink;
  return <Svg width={44} height={42}>
    {edges.map(([from, to], i) => <Line key={i} x1={corners[from][0]} y1={corners[from][1]} x2={corners[to][0]} y2={corners[to][1]}
      stroke={stroke} strokeWidth={1} strokeOpacity={from === 'h' || to === 'h' ? 0.35 : 1} />)}
    {status === 'publicado' && <Circle cx={22} cy={21} r={4} fill={color.axis} />}
    {status === 'personal' && <Circle cx={22} cy={21} r={2.5} fill={color.ink} />}
  </Svg>;
}

/** One cube in «Mis cubos»: glyph, name, what it is now, and its shape. */
export default function CubeRow({ cube, onPress }: { cube: CubeSummary; onPress: () => void }) {
  const status = cubeStatus(cube);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${cube.name}. ${statusLine(cube)}. ${shapeLine(cube)}`} onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Glyph status={status} />
      <View style={styles.text}>
        <Text numberOfLines={1} style={[styles.name, status === 'archivado' && styles.muted]}>{cube.name}</Text>
        <Text style={[styles.status, status === 'publicado' && styles.published]}>{statusLine(cube)}</Text>
        <Text style={styles.shape}>{shapeLine(cube)}</Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: tap + 24, flexDirection: 'row', alignItems: 'center', gap: space.s, paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  pressed: { opacity: 0.55 },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 18, color: color.ink, fontFamily: font.text, fontWeight: '300', letterSpacing: -0.3 },
  muted: { color: color.muted },
  status: { fontSize: 13, color: color.ink, fontFamily: font.text },
  published: { fontWeight: '500' },
  shape: { fontSize: 11, color: color.muted, fontFamily: font.mono },
  arrow: { fontSize: 16, color: color.muted },
});
