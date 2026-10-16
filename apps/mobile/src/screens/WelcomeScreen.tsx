import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line } from 'react-native-svg';
import { font } from '../ui/theme';
import FadeIn from './FadeIn';

interface WelcomeScreenProps { onContinue: () => void }

const steps = [['01', 'Eliges'], ['02', 'Se registra'], ['03', 'Lo ves en 3D']] as const;

/** First contact: what choisys is in one look, then a single way in. */
export default function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const column = Math.min(width, 560);
  // Bounded by height too, so a phone in landscape keeps everything on screen.
  const cube = Math.min(column * 0.62, 300, height * 0.3);
  return <ScrollView style={styles.screen} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}>
    <View style={styles.column}>
      <Image source={require('../../assets/brand/scenarys-mark-white.png')} accessibilityLabel="Scenarys"
        resizeMode="contain" style={styles.mark} />
      <FadeIn style={styles.hero} duration={520}>
        <HeroCube size={cube} />
        <Text style={styles.eyebrow}>scenarys presenta</Text>
        <Text accessibilityRole="header" style={[styles.brand, { fontSize: Math.min(column * 0.15, 72, height * 0.11) }]}>choisys</Text>
        <Text style={styles.headline}>Tus decisiones, en tres dimensiones.</Text>
        <Text style={styles.body}>Tres fases. Un toque en cada una. Cada intento queda registrado y se dibuja en el cubo.</Text>
        <View style={styles.steps}>
          {steps.map(([number, label]) => <View key={number} style={styles.step}>
            <Text style={styles.stepNumber}>{number}</Text>
            <Text style={styles.stepLabel}>{label}</Text>
          </View>)}
        </View>
      </FadeIn>
      <Pressable accessibilityRole="button" accessibilityLabel="Empezar" onPress={onContinue}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
        <Text style={styles.ctaText}>Empezar</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

// Decorative only: a fixed isometric wireframe in the cube view's language (white edges, green axes).
// It draws no data and computes nothing from the engine.
type P3 = [number, number, number];
// A three-quarter view (not pure isometric, which collapses into a flat hexagon).
const yaw = 0.62, pitch = 0.42;
const project = ([x, y, z]: P3): [number, number] => {
  const rx = x * Math.cos(yaw) - z * Math.sin(yaw);
  const rz = x * Math.sin(yaw) + z * Math.cos(yaw);
  return [rx, -(y * Math.cos(pitch) - rz * Math.sin(pitch))];
};
const edges: Array<[P3, P3]> = [];
for (const a of [-1, 1]) for (const b of [-1, 1]) {
  edges.push([[-1, a, b], [1, a, b]], [[a, -1, b], [a, 1, b]], [[a, b, -1], [a, b, 1]]);
}
const axes: Array<[P3, P3]> = [[[-1.3, 0, 0], [1.3, 0, 0]], [[0, -1.3, 0], [0, 1.3, 0]], [[0, 0, -1.3], [0, 0, 1.3]]];
// The 3 × 3 × 3 places a choice can land, drawn as quiet dots.
const lattice: P3[] = [];
for (const x of [-0.6, 0, 0.6]) for (const y of [-0.6, 0, 0.6]) for (const z of [-0.6, 0, 0.6]) lattice.push([x, y, z]);

function HeroCube({ size }: { size: number }) {
  const scale = size / 3.9;
  const point = (p: P3) => project(p).map(v => size / 2 + v * scale);
  const segment = ([from, to]: [P3, P3], stroke: string, width: number, key: string) => {
    const [x1, y1] = point(from); const [x2, y2] = point(to);
    return <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeLinecap="round" />;
  };
  return <Svg width={size} height={size} accessible={false}>
    {axes.map((axis, i) => segment(axis, '#39ff14', 1, `a${i}`))}
    {lattice.map((p, i) => { const [cx, cy] = point(p); return <Circle key={`d${i}`} cx={cx} cy={cy} r={1.8} fill="rgba(255,255,255,0.45)" />; })}
    {edges.map((edge, i) => segment(edge, 'rgba(255,255,255,0.88)', 1.2, `e${i}`))}
  </Svg>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  scroll: { flexGrow: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 560, paddingHorizontal: 28 },
  mark: { width: 26, height: 30, opacity: 0.9 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  eyebrow: { color: '#8a8a8a', fontFamily: font.mono, fontSize: 11, letterSpacing: 0.6, marginTop: 8 },
  brand: { color: '#ffffff', fontFamily: font.text, fontWeight: '300', letterSpacing: -2, marginTop: 6 },
  headline: { color: '#ffffff', fontFamily: font.text, fontSize: 20, lineHeight: 27, fontWeight: '300', textAlign: 'center', marginTop: 10 },
  body: { color: '#9a9a9a', fontFamily: font.text, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, maxWidth: 360 },
  steps: { flexDirection: 'row', width: '100%', maxWidth: 400, marginTop: 34, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2a2a2a' },
  step: { flex: 1, paddingTop: 14, alignItems: 'center' },
  stepNumber: { color: '#ffffff', fontFamily: font.mono, fontSize: 12 },
  stepLabel: { color: '#8a8a8a', fontFamily: font.text, fontSize: 12, marginTop: 4 },
  cta: { width: '100%', maxWidth: 430, alignSelf: 'center', minHeight: 54, borderRadius: 30,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  ctaText: { color: '#000000', fontSize: 16, lineHeight: 22, fontWeight: '500', fontFamily: font.text },
  pressed: { opacity: 0.72 },
});
