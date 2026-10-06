import { useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';
import type { RunMeasurements } from '../history/runHistory';
import FadeIn from './FadeIn';

interface CubeViewProps { runs: RunMeasurements[]; size: number }

const green = '#39ff14';
// Experiment: axes in neon green; past Runs (lines and points) in red.
const red = '#ff2a2a';
const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
const defaultView = { yaw: Math.PI / 6, pitch: Math.PI / 9 };
const maxPitch = Math.PI * 0.45;
const dragSpeed = 0.011;

type Vec = [number, number, number];

// Rendering only: lattice indices come from the engine untouched; this just orients the view.
function makeProjector(yaw: number, pitch: number, scale: number, center: number) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return ([x, y, z]: Vec): [number, number] => {
    const rx = x * cy - z * sy;
    const rz = x * sy + z * cy;
    const ry = y * cp - rz * sp;
    return [center + rx * scale, center + ry * scale];
  };
}

// Two separate elements, drawn only as edges:
// - the outer cube: a plain box at +/-2 that frames the whole view;
// - the decision grid: a 2 x 2 x 2 lattice whose 27 vertices (-1, 0, 1) are exactly the possible
//   decisions (row, column, phase). One cell of padding separates it from the outer cube.
const outerEdges: Array<[Vec, Vec]> = [];
for (const a of [-2, 2]) for (const b of [-2, 2]) {
  outerEdges.push([[-2, a, b], [2, a, b]], [[a, -2, b], [a, 2, b]], [[a, b, -2], [a, b, 2]]);
}
const gridEdges: Array<[Vec, Vec]> = [];
for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
  gridEdges.push([[-1, a, b], [1, a, b]], [[a, -1, b], [a, 1, b]], [[a, b, -1], [a, b, 1]]);
}

// Axes cross at the origin (0,0,0), the pivot of the rotation. z is the phase axis, 1 → 3.
const axisReach = 2.5;
const axes: Array<{ name: string; dir: Vec; label: string }> = [
  { name: 'x', dir: [1, 0, 0], label: 'x col' },
  { name: 'y', dir: [0, 1, 0], label: 'y row' },
  { name: 'z', dir: [0, 0, 1], label: 'z phase' },
];

function scaleVec(dir: Vec, amount: number): Vec { return [dir[0] * amount, dir[1] * amount, dir[2] * amount]; }

/** Draws the received observations only: x = column, y = row, z = phase. Drag to rotate, tap to reset. */
export default function CubeView({ runs, size }: CubeViewProps) {
  const [view, setView] = useState(defaultView);
  const current = useRef(view);
  current.current = view;
  const base = useRef(defaultView);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { base.current = current.current; },
    onPanResponderMove: (_event, gesture) => {
      setView({
        yaw: base.current.yaw + gesture.dx * dragSpeed,
        pitch: Math.max(-maxPitch, Math.min(maxPitch, base.current.pitch + gesture.dy * dragSpeed)),
      });
    },
    onPanResponderRelease: (_event, gesture) => {
      if (Math.abs(gesture.dx) < 4 && Math.abs(gesture.dy) < 4) setView(defaultView);
    },
  })).current;

  const scale = size * 0.15;
  const center = size / 2;
  const project = makeProjector(view.yaw, view.pitch, scale, center);
  const point = (row: number, column: number, phase: number) => project([column - 2, row - 2, phase - 2]);

  const zTip = project(scaleVec([0, 0, 1], axisReach));
  const zBack = project([0, 0, 2.0]);
  const arrowAngle = Math.atan2(zTip[1] - zBack[1], zTip[0] - zBack[0]);
  const arrow = (side: number): [number, number] => [
    zTip[0] - 9 * Math.cos(arrowAngle + side * 0.45), zTip[1] - 9 * Math.sin(arrowAngle + side * 0.45),
  ];

  return (
    <FadeIn duration={520} offset={0}>
      <View accessible accessibilityLabel={`Cubo con ${runs.length} ${runs.length === 1 ? 'intento' : 'intentos'} recientes. Arrastra para rotarlo.`}
        {...pan.panHandlers} style={Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as object) : undefined}>
        <Svg width={size} height={size}>
          {outerEdges.map(([from, to], index) => {
            const [x1, y1] = project(from);
            const [x2, y2] = project(to);
            return <Line key={`o${index}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity={0.4} strokeWidth={1.4} />;
          })}
          {gridEdges.map(([from, to], index) => {
            const [x1, y1] = project(from);
            const [x2, y2] = project(to);
            return <Line key={`g${index}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={0.9} />;
          })}

          {axes.map(axis => {
            const [x1, y1] = project(scaleVec(axis.dir, -axisReach * 0.6));
            const [x2, y2] = project(scaleVec(axis.dir, axisReach));
            const [lx, ly] = project(scaleVec(axis.dir, axisReach + 0.28));
            return <G key={axis.name}>
              <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={green} strokeWidth={1.8} />
              <SvgText x={lx} y={ly} fill={green} fontSize={11} fontFamily={mono} textAnchor="middle">{axis.label}</SvgText>
            </G>;
          })}
          <Line x1={zTip[0]} y1={zTip[1]} x2={arrow(1)[0]} y2={arrow(1)[1]} stroke={green} strokeWidth={1.8} />
          <Line x1={zTip[0]} y1={zTip[1]} x2={arrow(-1)[0]} y2={arrow(-1)[1]} stroke={green} strokeWidth={1.8} />
          {[1, 2, 3].map(phase => {
            const [tx, ty] = project([0, 0, phase - 2]);
            return <G key={phase}>
              <Circle cx={tx} cy={ty} r={2.6} fill={green} />
              <SvgText x={tx + 8} y={ty - 6} fill={green} fontSize={11} fontFamily={mono}>{`f${phase}`}</SvgText>
            </G>;
          })}
          <Circle cx={center} cy={center} r={3} fill={green} />

          {runs.map((run, index) => {
            const latest = index === runs.length - 1;
            const opacity = latest ? 1 : 0.45;
            const points = run.map(item => point(item.row, item.column, item.phase));
            const path = points.map(([x, y]) => `${x},${y}`).join(' ');
            return <G key={index}>
              {/* The latest Run (line, points and numbers) is bright white with a soft halo; older Runs are red. */}
              {latest && <Polyline points={path} fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" />}
              <Polyline points={path} fill="none" stroke={latest ? '#ffffff' : red} strokeOpacity={opacity}
                strokeWidth={latest ? 2.4 : 1.5} strokeLinejoin="round" strokeLinecap="round" />
              {points.map(([x, y], pointIndex) => <G key={pointIndex}>
                {latest && <Circle cx={x} cy={y} r={9} fill="#ffffff" fillOpacity={0.22} />}
                <Circle cx={x} cy={y} r={latest ? 5 : 4} fill={latest ? '#ffffff' : red} fillOpacity={opacity} />
                {latest && <SvgText x={x + 8} y={y + 14} fill="#ffffff" fontSize={11} fontFamily={mono}>{`${pointIndex + 1}`}</SvgText>}
              </G>)}
            </G>;
          })}
        </Svg>
        <Text style={styles.caption}>{runs.length === 0 ? 'no runs yet' : `last ${runs.length} ${runs.length === 1 ? 'run' : 'runs'}`}</Text>
        <Text style={styles.hint}>drag to rotate · tap to reset · phase 1 → 3</Text>
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  caption: { color: green, fontFamily: mono, fontSize: 13, textAlign: 'center', marginTop: 8 },
  hint: { color: '#8a8a8a', fontFamily: mono, fontSize: 11, textAlign: 'center', marginTop: 6 },
});
