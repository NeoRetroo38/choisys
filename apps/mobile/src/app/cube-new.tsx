import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useAccount } from '../account/AccountProvider';
import { errorMessage } from '../api/request';
import ActionRow from '../ui/ActionRow';
import EmptyState from '../ui/EmptyState';
import Screen from '../ui/Screen';
import Section from '../ui/Section';
import { color, font, inputChrome, space } from '../ui/theme';
import { dimension, emptyPhase, toPhases, type PhaseDraft } from '../cubes/cubeForm';

function Field({ label, value, onChange, numeric, hint }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; hint?: string }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput {...inputChrome} value={value} onChangeText={onChange} accessibilityLabel={label} placeholder={hint}
      placeholderTextColor={color.faint} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false}
      maxLength={numeric ? 2 : 600} style={styles.input} />
  </View>;
}

/** «Crear nuevo cubo»: nombre, número de fases y, por fase, ancho y alto (1–10) con su semántica `var:string`. */
export default function CubeNew() {
  const { api, model } = useAccount();
  const [name, setName] = useState('');
  const [phases, setPhases] = useState<PhaseDraft[]>([emptyPhase(0)]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace('/cubes');
  const set = (index: number, patch: Partial<PhaseDraft>) => setPhases(list => list.map((p, i) => i === index ? { ...p, ...patch } : p));
  const resize = (count: string) => {
    const n = dimension(count);
    if (n) setPhases(list => Array.from({ length: n }, (_, i) => list[i] ?? emptyPhase(i)));
  };

  async function create() {
    const built = toPhases(phases);
    if (!name.trim() || !built) { setNotice('Revisa el nombre y que ancho y alto de cada fase estén entre 1 y 10.'); return; }
    setBusy(true); setNotice(null);
    try {
      const cube = await api.createCube({ name: name.trim().slice(0, 120), phases: built });
      router.replace({ pathname: '/cube', params: { id: cube.cubeId } });
    } catch (error) { setNotice(errorMessage(error)); setBusy(false); }
  }

  if (!model.cubes) return <Screen title="nuevo cubo" onBack={back}><EmptyState text="Crear cubos es para admin y superiores." /></Screen>;
  return (
    <Screen title="nuevo cubo" onBack={back}>
      <Section>
        <Field label="Nombre" value={name} onChange={setName} hint="Decidir el stack" />
        <Field label="Fases (1–10)" value={String(phases.length)} onChange={resize} numeric />
      </Section>
      {phases.map((phase, index) => <Section key={index} label={`fase ${index + 1}`}>
        <Field label="Semántica de la fase" value={phase.label} onChange={label => set(index, { label })} hint="contexto:string" />
        <View style={styles.pair}>
          <View style={styles.half}><Field label="Ancho (1–10)" value={phase.width} onChange={width => set(index, { width })} numeric /></View>
          <View style={styles.half}><Field label="Alto (1–10)" value={phase.height} onChange={height => set(index, { height })} numeric /></View>
        </View>
        <Field label="Semántica de columnas" value={phase.columns} onChange={columns => set(index, { columns })} hint="precio:string, tiempo:string, …" />
        <Field label="Semántica de filas" value={phase.rows} onChange={rows => set(index, { rows })} hint="opción:string, …" />
      </Section>)}
      {notice && <EmptyState alert text={notice} />}
      <ActionRow label="Crear cubo" value="→" busy={busy} onPress={() => void create()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space.s },
  fieldLabel: { fontSize: 12, color: color.muted, fontFamily: font.text },
  input: { borderBottomWidth: 1, borderBottomColor: color.ink, fontSize: 16, paddingVertical: space.xs, fontFamily: font.text, color: color.ink, outlineStyle: 'none' } as object,
  pair: { flexDirection: 'row', gap: space.m },
  half: { flex: 1 },
});
