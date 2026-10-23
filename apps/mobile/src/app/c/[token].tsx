import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ParticipantResultResponse, PublicCube } from '@scenarys/shared';
import { errorMessage } from '../../api/request';
import { createProductClient } from '../../productApi';
import CubeView from '../../screens/CubeView';
import ExperienceScreen from '../../screens/ExperienceScreen';
import FadeIn from '../../screens/FadeIn';
import { participantStore } from '../../shares/participantStore';
import { createPublicApi } from '../../shares/publicApi';
import { color, font, inputChrome, maxWidth, space, tap } from '../../ui/theme';

const API = process.env.EXPO_PUBLIC_API_URL;
const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** A shared cube, without an account: name and grid, a name to join, the same play screen, then only one's own cube. */
export default function SharedCube() {
  const { token: link = '' } = useLocalSearchParams<{ token?: string }>();
  const publicApi = useMemo(() => createPublicApi(API), []);
  const [cube, setCube] = useState<PublicCube | null>(null);
  const [participant, setParticipant] = useState<string | null>(() => participantStore.get(link));
  const [result, setResult] = useState<ParticipantResultResponse | null>(null);
  const [playing, setPlaying] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const loadResult = useCallback(async (token: string) => {
    try { setResult(await publicApi.result(link, token)); } catch (error) { setNotice(errorMessage(error)); }
  }, [publicApi, link]);
  useEffect(() => {
    publicApi.cube(link).then(setCube, error => setNotice(errorMessage(error)));
    if (participant) void loadResult(participant);
  }, [publicApi, link, participant, loadResult]);

  async function join() {
    if (!name.trim() || busy) return;
    setBusy(true); setNotice(null);
    try {
      const token = await publicApi.join(link, name.trim(), email);
      participantStore.set(link, token);
      setParticipant(token);
      setPlaying(true);
    } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(false); }
  }

  const client = useMemo(() => createProductClient(API, fetch, 8000, () => participant, link), [participant, link]);
  if (playing && participant) {
    return <ExperienceScreen client={client} cubeId={link} exitLabel="ver mi cubo" onSignOut={() => undefined}
      onAccount={() => { setPlaying(false); void loadResult(participant); }} onUnauthorized={() => setPlaying(false)} />;
  }

  const runs = result?.runs ?? [];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.xl }]}>
      <FadeIn>
        <Text style={styles.brand}>choisys</Text>
        {!cube ? (notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : <ActivityIndicator color={color.current} />) : <>
          <Text accessibilityRole="header" style={styles.title}>{cube.name}</Text>
          <Text style={styles.meta}>{cube.shape.phases} {cube.shape.phases === 1 ? 'fase' : 'fases'} · {cube.shape.columns} × {cube.shape.rows}</Text>

          {participant && result ? <>
            <Text style={styles.lead}>{result.displayName}, este es tu cubo.</Text>
            {runs.length === 0 ? <Text style={styles.copy}>Aún no has completado ninguna run.</Text> :
              <View style={styles.cube}><CubeView runs={runs.map(run => run.measurements)} shape={result.shape} size={Math.min(width - space.m * 2, 420)}
                caption={`${runs.length} ${runs.length === 1 ? 'run' : 'runs'}`} /></View>}
            {runs.slice().reverse().map(run => <View key={run.runId} style={styles.run}>
              <Text style={styles.runDate}>{when(run.completedAt)}</Text>
              <Text style={styles.runCells}>{run.measurements.map(m => `${m.phase}:${m.row}·${m.column}`).join('  ')}</Text>
            </View>)}
            {cube.open ? <Pressable accessibilityRole="button" onPress={() => setPlaying(true)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>{runs.length ? 'Responder otra vez' : 'Comenzar'}</Text>
            </Pressable> : <Text style={styles.copy}>Este enlace ya no admite respuestas.</Text>}
          </> : participant ? <ActivityIndicator color={color.current} /> : cube.open ? <>
            <Text style={styles.lead}>Un toque en cada fase. No hay respuestas correctas.</Text>
            <Text style={styles.label}>Tu nombre</Text>
            <TextInput {...inputChrome} cursorColor={color.current} value={name} onChangeText={setName} accessibilityLabel="Tu nombre" maxLength={120}
              autoComplete="name" style={styles.input} placeholder="Nombre" placeholderTextColor="#555555" />
            <Text style={styles.label}>Email (opcional)</Text>
            <TextInput {...inputChrome} cursorColor={color.current} value={email} onChangeText={setEmail} accessibilityLabel="Email, opcional" maxLength={320}
              autoComplete="email" keyboardType="email-address" autoCapitalize="none" style={styles.input} placeholder="tu@email.com" placeholderTextColor="#555555" />
            <Text style={styles.privacy}>Quien compartió este enlace verá tu nombre, tu email si lo das y tus respuestas. Tú solo verás tu propio cubo.</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !name.trim() || busy, busy }} disabled={!name.trim() || busy}
              onPress={() => void join()} style={({ pressed }) => [styles.button, (!name.trim() || busy) && styles.disabled, pressed && styles.pressed]}>
              {busy ? <ActivityIndicator color={color.ink} /> : <Text style={styles.buttonText}>Comenzar</Text>}
            </Pressable>
          </> : <Text style={styles.copy}>Este enlace ya no admite respuestas.</Text>}
          {notice && <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text>}
        </>}
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.night },
  content: { width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: space.m },
  brand: { color: color.current, fontSize: 22, fontFamily: font.text, fontWeight: '400', letterSpacing: -0.6, marginBottom: space.xl },
  title: { color: color.current, fontSize: 34, fontFamily: font.text, fontWeight: '300', letterSpacing: -1 },
  meta: { color: '#8a8a8a', fontSize: 12, fontFamily: font.mono, marginTop: space.xs, marginBottom: space.l },
  lead: { color: color.current, fontSize: 17, lineHeight: 25, fontFamily: font.text, fontWeight: '300', marginBottom: space.l },
  copy: { color: '#8a8a8a', fontSize: 14, lineHeight: 21, fontFamily: font.text, marginVertical: space.m },
  label: { color: '#8a8a8a', fontSize: 12, fontFamily: font.text, marginTop: space.s },
  input: { color: color.current, fontSize: 17, fontFamily: font.text, borderBottomWidth: 1, borderBottomColor: '#444444', paddingVertical: space.xs, outlineStyle: 'none' } as object,
  privacy: { color: '#8a8a8a', fontSize: 12, lineHeight: 18, fontFamily: font.text, marginTop: space.m },
  button: { minHeight: tap, borderRadius: 30, backgroundColor: color.current, alignItems: 'center', justifyContent: 'center', marginTop: space.l, paddingHorizontal: space.l },
  buttonText: { color: color.ink, fontSize: 16, fontFamily: font.text },
  cube: { alignItems: 'center', marginBottom: space.m },
  run: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#222222', paddingVertical: space.s },
  runDate: { color: color.current, fontSize: 14, fontFamily: font.text },
  runCells: { color: color.axis, fontSize: 12, fontFamily: font.mono, marginTop: 2 },
  notice: { color: '#d0d0d0', fontSize: 14, lineHeight: 21, fontFamily: font.text, marginTop: space.m },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.65 },
});
