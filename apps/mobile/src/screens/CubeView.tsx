import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline } from 'react-native-svg';
import type { RunMeasurements } from '../history/runHistory';

interface CubeViewProps { runs: RunMeasurements[]; size: number }

const green = '#3dff7a';
const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

// Fixed viewing angle. This is rendering only: lattice indices come from the engine untouched.
const yaw = Math.PI / 6;
const pitch = Math.PI / 9;

function project(x: number, y: number, z: number, scale: number, center: number): [number, number] {
  const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
  const rz = x * Math.sin(yaw) + z * Math.cos(yaw);
  const ry = y * Math.cos(pitch) - rz * Math.sin(pitch);
  return [center + rx * scale, center + ry * scale];
}

const corners = [-1.5, 1.5];
const edges: Array<[[number, number, number], [number, number, number]]> = [];
for (const a of corners) for (const b of corners) {
  edges.push([[-1.5, a, b], [1.5, a, b]], [[a, -1.5, b], [a, 1.5, b]], [[a, b, -1.5], [a, b, 1.5]]);
}

/** Draws the received observations only: x = column, y = row, z = phase. No values are derived. */
export default function CubeView({ runs, size }: CubeViewProps) {
  const scale = size * 0.2;
  const center = size / 2;
  const point = (row: number, column: number, phase: number) => project(column - 2, row - 2, phase - 2, scale, center);
  return (
    <View accessible accessibilityLabel={`Cubo con ${runs.length} ${runs.length === 1 ? 'intento' : 'intentos'} recientes`}>
      <Svg width={size} height={size}>
        {edges.map(([from, to], index) => {
          const [x1, y1] = project(...from, scale, center);
          const [x2, y2] = project(...to, scale, center);
          return <Line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1} />;
        })}
        {runs.map((run, index) => {
          const latest = index === runs.length - 1;
          const opacity = latest ? 1 : 0.28;
          const points = run.map(item => point(item.row, item.column, item.phase));
          return <G key={index}>
            <Polyline points={points.map(([x, y]) => `${x},${y}`).join(' ')} fill="none"
              stroke={green} strokeOpacity={opacity} strokeWidth={latest ? 2 : 1.5} />
            {points.map(([x, y], pointIndex) => <Circle key={pointIndex} cx={x} cy={y} r={latest ? 5 : 4}
              fill={green} fillOpacity={opacity} />)}
          </G>;
        })}
      </Svg>
      <Text style={styles.caption}>{runs.length === 0 ? 'no runs yet' : `last ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { color: green, fontFamily: mono, fontSize: 13, textAlign: 'center', marginTop: 8 },
});
