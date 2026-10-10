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
import { emptyDraft, toCube, type CubeDraft } from '../cubes/cubeForm';

function Field({ label, value, onChange, numeric, hint }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean; hint?: string }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput {...inputChrome} value={value} onChangeText={onChange} accessibilityLabel={label} placeholder={hint}
      placeholderTextColor={color.faint} keyboardType={numeric ? 'number-pad' : 'default'} autoCapitalize="none" autoCorrect={false}
      maxLength={numeric ? 2 : 600} style={styles.input} />
  </View>;
}

/** «Crear nuevo cubo»: un único formulario. Todas las fases usan el mismo ancho, alto y semántica. */
export default function CubeNew() {
  const { api, model } = useAccount();
  const [draft, setDraft] = useState<CubeDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace('/cubes');
  const set = (patch: Partial<CubeDraft>) => setDraft(current => ({ ...current, ...patch }));

  async function create() {
    const cube = toCube(draft);
    if (!cube) { setNotice('Pon un nombre y que fases, ancho y alto estén entre 1 y 10.'); return; }
    setBusy(true); setNotice(null);
    try {
      const created = await api.createCube(cube);
      router.replace({ pathname: '/cube', params: { id: created.cubeId } });
    } catch (error) { setNotice(errorMessage(error)); setBusy(false); }
  }

  if (!model.cubes) return <Screen title="nuevo cubo" onBack={back}><EmptyState text="Crear cubos es para admin y superiores." /></Screen>;
  return (
    <Screen title="nuevo cubo" onBack={back}>
      <Section>
        <Field label="Nombre" value={draft.name} onChange={name => set({ name })} hint="Decidir el stack" />
      </Section>
      <Section label="fases">
        <View style={styles.pair}>
          <View style={styles.narrow}><Field label="Número (1–10)" value={draft.phases} onChange={phases => set({ phases })} numeric /></View>
          <View style={styles.wide}><Field label="Semántica" value={draft.phaseLabel} onChange={phaseLabel => set({ phaseLabel })} hint="contexto:string" /></View>
        </View>
      </Section>
      <Section label="ancho · columnas">
        <View style={styles.pair}>
          <View style={styles.narrow}><Field label="Ancho (1–10)" value={draft.width} onChange={width => set({ width })} numeric /></View>
          <View style={styles.wide}><Field label="Semántica, separada por comas" value={draft.columns} onChange={columns => set({ columns })} hint="precio:string, tiempo:string" /></View>
        </View>
      </Section>
      <Section label="alto · filas">
        <View style={styles.pair}>
          <View style={styles.narrow}><Field label="Alto (1–10)" value={draft.height} onChange={height => set({ height })} numeric /></View>
          <View style={styles.wide}><Field label="Semántica, separada por comas" value={draft.rows} onChange={rows => set({ rows })} hint="opción:string" /></View>
        </View>
      </Section>
      <Text style={styles.note}>Todas las fases usan esta misma cuadrícula.</Text>
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
  narrow: { width: 104 },
  wide: { flex: 1 },
  note: { fontSize: 12, color: color.muted, fontFamily: font.text, marginBottom: space.s },
});
