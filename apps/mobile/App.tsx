import { useReducer, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EvaluateRequest, Position } from '@scenarys/shared';
import { createProductClient, toUiError } from './src/productApi';
import { initialState, sessionReducer } from './src/sessionState';

const client = createProductClient(process.env.EXPO_PUBLIC_API_URL);
const positions: Position[][] = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];

export default function App() {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const inFlight = useRef(false);

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: 'starting' });
    try {
      const response = await client.startSession();
      dispatch({ type: 'started', session: response.session });
    } catch (error) {
      dispatch({ type: 'failed', error: toUiError(error) });
    } finally {
      inFlight.current = false;
    }
  }

  async function submit() {
    if (inFlight.current || !state.sessionId || !state.selected || state.error?.restart) return;
    const request: EvaluateRequest = state.pending ?? {
      scenarioId: 'choice-grid', sessionId: state.sessionId, phase: state.phase,
      decisions: [{ position: state.selected, selected: true, value: 1 }],
    };
    inFlight.current = true;
    dispatch({ type: 'sending', request });
    try {
      const response = await client.evaluate(request);
      dispatch({ type: 'received', result: response.result });
    } catch (error) {
      dispatch({ type: 'failed', error: toUiError(error) });
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>choisys</Text>
          <Text style={styles.company}>scenarys S.L.</Text>
        </View>
        <View style={styles.card}>
          {state.screen === 'home' && <>
            <Text style={styles.eyebrow}>UN ESPACIO PARA ELEGIR</Text>
            <Text style={styles.title}>Una elección a la vez.</Text>
            <Text style={styles.description}>Recorre tres fases. En cada una, selecciona una casilla y confirma tu elección.</Text>
            <Pressable accessibilityRole="button" disabled={state.busy} onPress={start}
              style={({ pressed }) => [styles.primary, state.busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{state.busy ? 'Preparando…' : 'Comenzar'}</Text>
            </Pressable>
          </>}
          {state.screen === 'phase' && <>
            <Text style={styles.eyebrow}>FASE {state.phase} DE 3</Text>
            <Text style={styles.title}>Elige una casilla</Text>
            <Text style={styles.description}>Puedes tocar tu selección de nuevo para desmarcarla antes de confirmar.</Text>
            {state.notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{state.notice}</Text>}
            <View style={styles.grid}>
              {positions.map((row, index) => <View key={index} style={styles.gridRow}>
                {row.map((position) => {
                  const selected = state.selected === position;
                  const disabled = state.busy || state.pending !== null || !!state.error?.restart;
                  return <Pressable key={position} accessibilityRole="checkbox"
                    accessibilityLabel={`Casilla ${position}`}
                    accessibilityState={{ checked: selected, disabled }} disabled={disabled}
                    onPress={() => dispatch({ type: 'selected', position })}
                    style={({ pressed }) => [styles.cell, selected && styles.selectedCell, pressed && styles.pressed]}>
                    <Text style={[styles.cellNumber, selected && styles.selectedText]}>{position}</Text>
                    <Text style={[styles.cellState, selected && styles.selectedText]}>{selected ? 'Sí' : 'No'}</Text>
                  </Pressable>;
                })}
              </View>)}
            </View>
            <Pressable accessibilityRole="button" onPress={submit}
              disabled={!state.selected || state.busy || !!state.error?.restart}
              style={({ pressed }) => [styles.primary, (!state.selected || state.busy || state.error?.restart) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{state.busy ? 'Enviando…' : state.pending ? 'Reintentar la misma elección' : 'Confirmar elección'}</Text>
            </Pressable>
            {state.pending && !state.busy && !state.error?.restart && <Text style={styles.hint}>Conservamos tu elección para que puedas reintentar sin duplicarla.</Text>}
          </>}
          {state.screen === 'result' && <>
            <Text style={styles.eyebrow}>RESULTADO</Text>
            <Text style={styles.title}>Sesión completada</Text>
            <Text accessibilityLiveRegion="polite" style={styles.success}>Tus elecciones de las tres fases se han registrado correctamente.</Text>
            <Text style={styles.description}>Has terminado este recorrido. Puedes comenzar una nueva sesión cuando quieras.</Text>
            <Pressable accessibilityRole="button" onPress={start} disabled={state.busy}
              style={({ pressed }) => [styles.primary, state.busy && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Nueva sesión</Text>
            </Pressable>
          </>}
          {state.busy && <View accessibilityLiveRegion="polite" style={styles.loading}>
            <ActivityIndicator color="#236950" />
            <Text style={styles.hint}>Conectando…</Text>
          </View>}
          {state.error && <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>{state.error.message}</Text>
          </View>}
          {state.screen !== 'home' && <Pressable accessibilityRole="button" disabled={state.busy}
            onPress={() => dispatch({ type: 'reset' })} style={styles.secondary}>
            <Text style={[styles.secondaryText, state.busy && styles.disabled]}>{state.error?.restart ? 'Volver y reiniciar sesión' : 'Volver al inicio'}</Text>
          </Pressable>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f4ef' },
  content: { paddingHorizontal: 24, paddingTop: 72, paddingBottom: 48, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36 },
  brand: { fontSize: 28, fontWeight: '700', color: '#18392e', letterSpacing: -1 },
  company: { fontSize: 12, color: '#5a6d62' },
  card: { backgroundColor: '#ffffff', padding: 24, borderRadius: 24, gap: 20 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#547367' },
  title: { fontSize: 30, fontWeight: '600', color: '#18392e', lineHeight: 36 },
  description: { fontSize: 16, lineHeight: 24, color: '#52665c' },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, minHeight: 76, aspectRatio: 1, borderRadius: 16, borderWidth: 1, borderColor: '#d8e1da', backgroundColor: '#f6f8f5', alignItems: 'center', justifyContent: 'center', gap: 4 },
  selectedCell: { backgroundColor: '#236950', borderColor: '#236950' },
  cellNumber: { color: '#355747', fontSize: 23, fontWeight: '600' },
  cellState: { color: '#61766b', fontSize: 12 },
  selectedText: { color: '#ffffff' },
  primary: { backgroundColor: '#236950', minHeight: 54, padding: 15, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  secondary: { alignItems: 'center', paddingVertical: 12 },
  secondaryText: { color: '#355747', fontSize: 14, textDecorationLine: 'underline' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  hint: { color: '#61766b', fontSize: 13, lineHeight: 19 },
  success: { color: '#236950', fontSize: 15, lineHeight: 22 },
  errorBox: { backgroundColor: '#fff0e9', padding: 14, borderRadius: 12 },
  errorText: { color: '#923f25', fontSize: 14, lineHeight: 21 },
});
