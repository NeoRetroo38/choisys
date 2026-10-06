import { useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EvaluateRequest, Position } from '@scenarys/shared';
import { createProductClient, isAuthenticationError, toUiError } from '../productApi';
import { initialState, sessionReducer } from '../sessionState';
import { appendRun, parseHistory, type RunMeasurements } from '../history/runHistory';
import { historyStorage } from '../history/historyStorage';
import { playSound } from '../sound';
import CubeView from './CubeView';
import FadeIn from './FadeIn';
import PopCircle from './PopCircle';

interface ExperienceScreenProps {
  client: ReturnType<typeof createProductClient>;
  onSignOut: () => void;
  onUnauthorized: () => void;
}

const positions: Position[][] = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
const phaseTitles = { 1: '1. fase one.', 2: '2. fase two.', 3: '3. fase three.' };

export default function ExperienceScreen({ client, onSignOut, onUnauthorized }: ExperienceScreenProps) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const inFlight = useRef(false);
  const [history, setHistory] = useState<RunMeasurements[]>([]);
  const [showCube, setShowCube] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const canvasWidth = Math.min(width, 560);
  const circleSize = Math.max(44, canvasWidth * 0.158);
  const circleGap = canvasWidth * 0.081;

  useEffect(() => {
    historyStorage.getItem().then(raw => setHistory(parseHistory(raw)), () => undefined);
  }, []);

  function remember(run: RunMeasurements) {
    const next = appendRun(history, run);
    setHistory(next);
    historyStorage.setItem(JSON.stringify(next)).catch(() => undefined);
  }

  function fail(error: unknown) {
    if (isAuthenticationError(error)) {
      onUnauthorized();
      return;
    }
    playSound('error');
    dispatch({ type: 'failed', error: toUiError(error) });
  }

  async function start() {
    if (inFlight.current) return;
    playSound('tap');
    inFlight.current = true;
    dispatch({ type: 'starting' });
    try {
      const response = await client.startSession();
      dispatch({ type: 'started', session: response.session });
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
    }
  }

  async function send(request: EvaluateRequest) {
    if (inFlight.current || state.error?.restart) return;
    inFlight.current = true;
    dispatch({ type: 'sending', request });
    try {
      const response = await client.evaluate(request);
      if (response.result.measurements) remember(response.result.measurements);
      // Let the pop finish before the next phase fades in.
      await new Promise(resolve => setTimeout(resolve, 260));
      playSound(response.result.status === 'completed' ? 'complete' : 'phase');
      dispatch({ type: 'received', result: response.result });
    } catch (error) {
      fail(error);
    } finally {
      inFlight.current = false;
    }
  }

  /** One tap selects and sends; no confirmation step. */
  function choose(position: Position) {
    if (inFlight.current || !state.sessionId || state.busy || state.pending || state.error?.restart) return;
    playSound('tap');
    dispatch({ type: 'selected', position });
    void send({
      scenarioId: 'choice-grid', sessionId: state.sessionId, phase: state.phase,
      decisions: [{ position, selected: true, value: 1 }],
    });
  }

  if (showCube) {
    return (
      <View style={styles.cubeScreen}>
        <View style={[styles.cubeBody, { paddingTop: insets.top + 24 }]}>
          <CubeView runs={history} size={Math.min(width, 420)} />
          <Pressable accessibilityRole="button" onPress={() => setShowCube(false)}
            style={({ pressed }) => [styles.cubeBack, pressed && styles.pressed]}>
            <Text style={styles.cubeBackText}>volver</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const viewCube = history.length > 0 && <Pressable accessibilityRole="button" onPress={() => { playSound('cube'); setShowCube(true); }}
    style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
    <Text style={styles.secondaryText}>Ver mi cubo</Text>
  </Pressable>;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, {
        minHeight: height,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 12,
      }]}>
        {state.screen === 'home' && <FadeIn key="home" style={[styles.home, { minHeight: Math.max(440, height - insets.top - insets.bottom - 82) }]}>
          <Text style={[styles.brand, { fontSize: canvasWidth * 0.092 }]}>choisys</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Comenzar las tres fases"
            accessibilityHint="Elige un círculo en cada fase."
            accessibilityState={{ disabled: state.busy, busy: state.busy }} disabled={state.busy}
            onPress={start} style={({ pressed }) => [styles.start, {
              width: Math.max(78, canvasWidth * 0.215), height: Math.max(78, canvasWidth * 0.215),
              marginTop: canvasWidth * 0.245,
            }, state.busy && styles.disabled, pressed && styles.pressed]}>
            {state.busy ? <ActivityIndicator color="#ffffff" /> : <View accessible={false} style={styles.dots}>
              {[1, 2, 3].map((dot) => <View key={dot} style={styles.dot} />)}
            </View>}
          </Pressable>
          {state.error && <Text accessibilityRole="alert" style={styles.homeError}>{state.error.message}</Text>}
          {viewCube}
        </FadeIn>}

        {state.screen === 'phase' && <FadeIn key={`phase-${state.phase}`} style={[styles.phase, { paddingTop: Math.max(38, height * 0.16 - insets.top) }]}>
          <Text key={state.phase} accessibilityRole="header" accessibilityLiveRegion="polite"
            accessibilityLabel={`Fase ${state.phase} de 3. Elige un círculo.`}
            style={[styles.phaseTitle, { fontSize: canvasWidth * 0.091, marginLeft: canvasWidth * 0.139 }]}>
            {phaseTitles[state.phase]}
          </Text>
          <View key={`grid-${state.phase}`} style={[styles.grid, { marginTop: canvasWidth * 0.232, gap: circleGap }]}>
            {positions.map((row, rowIndex) => <View key={rowIndex} style={[styles.gridRow, { gap: circleGap }]}>
              {row.map((position, columnIndex) => <PopCircle key={position} size={circleSize}
                delay={(rowIndex * 3 + columnIndex) * 45}
                label={`Círculo ${position}, fila ${rowIndex + 1}, columna ${columnIndex + 1}`}
                selected={state.selected === position}
                disabled={state.busy || state.pending !== null || !!state.error?.restart}
                onPress={() => choose(position)} />)}
            </View>)}
          </View>

          <View style={[styles.phaseActions, { marginTop: canvasWidth * 0.11 }]}>
            {state.busy && <ActivityIndicator color="#000000" size="small" />}
            {state.pending && !state.busy && !state.error?.restart && <Pressable accessibilityRole="button"
              onPress={() => void send(state.pending!)}
              style={({ pressed }) => [styles.confirm, pressed && styles.pressed]}>
              <Text style={styles.confirmText}>Reintentar</Text>
            </Pressable>}
            {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error.message}</Text>}
            {state.pending && !state.busy && !state.error?.restart && <Text style={styles.hint}>
              Tu elección sigue guardada para reintentar.
            </Text>}
          </View>
          <Pressable accessibilityRole="button" disabled={state.busy}
            onPress={() => dispatch({ type: 'reset' })}
            style={({ pressed }) => [styles.back, state.busy && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>{state.error?.restart ? 'Volver y comenzar de nuevo' : 'Volver al inicio'}</Text>
          </Pressable>
        </FadeIn>}

        {state.screen === 'result' && <FadeIn key="result" style={[styles.result, { minHeight: Math.max(440, height - insets.top - insets.bottom - 82) }]}>
          <Text style={styles.resultBrand}>choisys</Text>
          <View accessible={false} style={styles.completedDots}>
            {[1, 2, 3].map((dot) => <View key={dot} style={styles.completedDot} />)}
          </View>
          <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.resultTitle}>3 fases completadas.</Text>
          <Text style={styles.resultCopy}>Cada elección cuenta.</Text>
          <Pressable accessibilityRole="button" onPress={start} disabled={state.busy}
            style={({ pressed }) => [styles.confirm, styles.newRun, state.busy && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.confirmText}>Volver a empezar</Text>
          </Pressable>
          {viewCube}
          <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'reset' })} disabled={state.busy}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Volver al inicio</Text>
          </Pressable>
        </FadeIn>}

        {state.screen !== 'phase' && <Pressable accessibilityRole="button" onPress={onSignOut}
          disabled={state.busy} style={({ pressed }) => [styles.signOut, state.busy && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>Cerrar sesión</Text>
        </Pressable>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fdfdfd' },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  home: { alignItems: 'center', justifyContent: 'center', paddingBottom: 30 },
  brand: { fontWeight: '400', letterSpacing: -1.2, color: '#000000' },
  start: { borderRadius: 999, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  dots: { gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 99, backgroundColor: '#ffffff' },
  phase: { flex: 1, paddingBottom: 16 },
  phaseTitle: { color: '#000000', fontWeight: '400', letterSpacing: -1.2 },
  grid: { alignItems: 'center' },
  gridRow: { flexDirection: 'row' },
  circle: { borderRadius: 999, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' },
  selectedCircle: { backgroundColor: '#000000' },
  selectionCenter: { borderRadius: 999, backgroundColor: '#fdfdfd' },
  phaseActions: { minHeight: 60, alignItems: 'center', paddingHorizontal: 40 },
  confirm: { minWidth: 152, minHeight: 48, paddingHorizontal: 28, paddingVertical: 13,
    borderRadius: 30, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  confirmText: { color: '#ffffff', fontSize: 15, lineHeight: 22 },
  back: { minHeight: 48, paddingVertical: 15, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { fontSize: 12, color: '#707070', lineHeight: 18, textAlign: 'center' },
  signOut: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 'auto', paddingVertical: 14 },
  error: { color: '#333333', fontSize: 14, lineHeight: 21, marginTop: 18, textAlign: 'center' },
  homeError: { color: '#333333', fontSize: 14, lineHeight: 21, marginTop: 32, paddingHorizontal: 40, textAlign: 'center' },
  hint: { color: '#707070', fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  result: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  resultBrand: { fontSize: 26, fontWeight: '400', letterSpacing: -0.7, color: '#000000' },
  completedDots: { flexDirection: 'row', gap: 15, marginTop: 60, marginBottom: 38 },
  completedDot: { width: 14, height: 14, borderRadius: 99, backgroundColor: '#000000' },
  resultTitle: { fontSize: 28, fontWeight: '400', letterSpacing: -0.7, textAlign: 'center', color: '#000000' },
  resultCopy: { color: '#707070', fontSize: 15, lineHeight: 22, marginTop: 14, textAlign: 'center' },
  newRun: { marginTop: 46 },
  cubeScreen: { flex: 1, backgroundColor: '#000000' },
  cubeBody: { flex: 1, alignItems: 'center' },
  cubeBack: { minHeight: 48, paddingVertical: 15, paddingHorizontal: 24, marginTop: 28 },
  cubeBackText: { color: '#3dff7a', fontSize: 14, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
});
