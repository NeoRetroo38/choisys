import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Animated, PanResponder, type PanResponderInstance, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { accents, emojiChoices, hexToHue, hueToHex } from '../cube/cubePrefs';
import { useCubePrefs } from '../cube/useCubePrefs';
import CubeView from '../screens/CubeView';
import HueBar from '../ui/HueBar';
import { color, font, space, tap } from '../ui/theme';

const sample = [[{ phase: 1, row: 1, column: 2 }, { phase: 2, row: 2, column: 2 }, { phase: 3, row: 3, column: 1 }]];
const phases = [0, 1, 2];
type Source = 'tray' | number;
type Rect = { x: number; y: number; w: number; h: number };
const inside = (r: Rect | undefined, x: number, y: number) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** An emoji that springs in when it lands in a phase. */
function Landed({ emoji }: { emoji: string }) {
  const [scale] = useState(() => new Animated.Value(0.3));
  useEffect(() => { Animated.spring(scale, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }).start(); }, [scale]);
  return <Animated.Text style={[styles.slotEmoji, { transform: [{ scale }] }]}>{emoji}</Animated.Text>;
}

/** Drag from the tray to a phase; drag out of a phase to remove. Tapping works too (tray → marked phase). */
export default function CubeStyle() {
  const [prefs, update] = useCubePrefs();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [marked, setMarked] = useState(0);
  const [drag, setDrag] = useState<{ emoji: string; from: Source } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [ghost] = useState(() => new Animated.ValueXY());
  const slots = useRef<Array<View | null>>([]);
  const rects = useRef<Rect[]>([]);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const markedRef = useRef(marked);
  markedRef.current = marked;
  const updateRef = useRef(update);
  updateRef.current = update;
  const pans = useRef(new Map<string, PanResponderInstance>());
  const back = () => router.canGoBack() ? router.back() : router.replace('/account');

  const measure = () => slots.current.forEach((view, index) =>
    view?.measureInWindow((x, y, w, h) => { rects.current[index] = { x, y, w, h }; }));
  const setPhase = (phase: number, emoji: string, from?: Source) => {
    const next = [...prefsRef.current.phaseEmojis];
    while (next.length < 3) next.push('');
    if (typeof from === 'number' && from !== phase) next[from] = '';
    next[phase] = emoji;
    updateRef.current({ phaseEmojis: next });
  };
  const hit = (x: number, y: number) => { const i = rects.current.findIndex(r => inside(r, x, y)); return i < 0 ? null : i; };

  // One responder factory shared by tray items and filled phases; callbacks read the latest state through refs.
  const makePan = (emoji: string, from: Source) => {
    const key = `${from}:${emoji}`;
    const cached = pans.current.get(key);
    if (cached) return cached;
    const created = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => {
      measure();
      ghost.setValue({ x: event.nativeEvent.pageX - 28, y: event.nativeEvent.pageY - 28 });
      setDrag({ emoji, from });
    },
    onPanResponderMove: (event) => {
      const { pageX, pageY } = event.nativeEvent;
      ghost.setValue({ x: pageX - 28, y: pageY - 28 });
      setHover(hit(pageX, pageY));
    },
    onPanResponderRelease: (event, gesture) => {
      const target = hit(event.nativeEvent.pageX, event.nativeEvent.pageY);
      const tapped = Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6;
      if (tapped) {
        if (from === 'tray') setPhase(markedRef.current, emoji); else setMarked(from);
      } else if (target !== null) {
        setPhase(target, emoji, from);
        setMarked(target);
      } else if (typeof from === 'number') {
        setPhase(from, '');
      }
      setDrag(null); setHover(null);
    },
    onPanResponderTerminate: () => { setDrag(null); setHover(null); },
    });
    pans.current.set(key, created);
    return created;
  };

  const hue = hexToHue(prefs.accent);
  const cube = Math.min(width - 2 * space.m, height * 0.27, 320);
  const cell = Math.floor((Math.min(width, 560) - 2 * space.m) / 8);
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.s, paddingBottom: insets.bottom + space.s }]}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={back} hitSlop={12}><Text style={styles.backText}>←</Text></Pressable>
        <Text accessibilityRole="header" style={styles.title}>estilo del cubo</Text>
      </View>

      <View style={styles.preview}><CubeView runs={sample} size={cube} caption=" " /></View>

      <Text style={styles.label}>color</Text>
      <HueBar hue={hue} onChange={value => update({ accent: hueToHex(value) })} />
      <View style={styles.chips}>
        <Pressable accessibilityRole="button" onPress={() => update({ accent: accents.neon })} style={styles.chip}><Text style={styles.chipText}>neón original</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => update({ accent: accents.blanco })} style={styles.chip}><Text style={styles.chipText}>blanco</Text></Pressable>
      </View>

      <Text style={styles.label}>fases · arrastra un icono a cada una</Text>
      {phases.map(phase => {
        const emoji = prefs.phaseEmojis[phase] ?? '';
        const active = hover === phase || (drag === null && marked === phase);
        return <View key={phase} style={styles.slotRow}>
          <Text style={styles.slotNumber}>{phase + 1}</Text>
          <View ref={view => { slots.current[phase] = view; }} onLayout={measure}
            accessible accessibilityRole="button" accessibilityLabel={`Fase ${phase + 1}: ${emoji || 'sin icono'}`}
            accessibilityHint="Toca un icono de la bandeja para ponerlo aquí"
            style={[styles.slot, active && styles.slotActive, hover === phase && styles.slotHover]}>
            {emoji ? <View {...makePan(emoji, phase).panHandlers} style={styles.slotHandle}><Landed key={emoji} emoji={emoji} /></View>
              : <Pressable style={styles.slotHandle} onPress={() => setMarked(phase)}><Text style={styles.placeholder}>suelta aquí · f{phase + 1}</Text></Pressable>}
          </View>
        </View>;
      })}

      <View style={styles.tray}>
        {emojiChoices.map(emoji => <View key={emoji} {...makePan(emoji, 'tray').panHandlers} accessible accessibilityRole="button"
          accessibilityLabel={`${emoji}: ponerlo en la fase ${marked + 1}`} style={[styles.trayItem, { width: cell }, drag?.emoji === emoji && styles.trayDragging]}>
          <Text style={styles.trayEmoji}>{emoji}</Text>
        </View>)}
      </View>

      {drag && <Animated.View pointerEvents="none" style={[styles.ghost, { transform: ghost.getTranslateTransform() }]}>
        <Text style={styles.ghostEmoji}>{drag.emoji}</Text>
      </Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper, paddingHorizontal: space.m, gap: space.xs },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: tap },
  backText: { fontSize: 26, color: color.ink },
  title: { fontSize: 28, color: color.ink, fontFamily: font.text, fontWeight: '300', letterSpacing: -0.8 },
  preview: { backgroundColor: color.night, borderRadius: 20, alignItems: 'center', paddingVertical: space.xs },
  label: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: color.muted, fontFamily: font.mono, marginTop: space.s },
  chips: { flexDirection: 'row', gap: space.xs },
  chip: { borderWidth: 1, borderColor: color.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  chipText: { fontSize: 12, color: color.ink, fontFamily: font.mono },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  slotNumber: { width: 14, fontSize: 14, color: color.muted, fontFamily: font.mono },
  slot: { flex: 1, height: 52, borderRadius: 26, borderWidth: 1, borderColor: color.line, justifyContent: 'center' },
  slotActive: { borderColor: color.ink },
  slotHover: { borderWidth: 2, backgroundColor: '#f2f2f2', transform: [{ scale: 1.02 }] },
  slotHandle: { height: '100%', justifyContent: 'center', paddingHorizontal: 18 },
  slotEmoji: { fontSize: 28 },
  placeholder: { fontSize: 13, color: color.faint, fontFamily: font.mono },
  tray: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 'auto', paddingTop: space.s,
    borderTopWidth: 1, borderTopColor: color.line },
  trayItem: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  trayDragging: { opacity: 0.3 },
  trayEmoji: { fontSize: 26 },
  ghost: { position: 'absolute', left: 0, top: 0, width: 56, height: 56, borderRadius: 28, backgroundColor: color.paper,
    alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 },
  ghostEmoji: { fontSize: 32 },
});
