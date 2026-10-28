import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAccount } from '../account/AccountProvider';
import { errorMessage } from '../api/request';
import EmptyState from '../ui/EmptyState';
import Screen from '../ui/Screen';
import Section from '../ui/Section';
import { color, font, inputChrome, space, tap } from '../ui/theme';
import { MAX, cells, dimension, emptyDraft, fromCube, joinCells, shown, toCube, type CubeDraft } from '../cubes/cubeForm';

function Field({ label, value, onChange, hint, multiline }: { label: string; value: string; onChange: (v: string) => void; hint?: string; multiline?: boolean }) {
  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput {...inputChrome} value={value} onChangeText={onChange} accessibilityLabel={label} placeholder={hint}
      placeholderTextColor={color.faint} autoCorrect={false} maxLength={600} multiline={multiline} style={styles.input} />
  </View>;
}

/** − n + for phases, columns and rows (1–10). */
function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const button = (delta: number, text: string) => <Pressable accessibilityRole="button" accessibilityLabel={`${delta < 0 ? 'Menos' : 'Más'} ${label}`}
    disabled={value + delta < 1 || value + delta > MAX} onPress={() => onChange(value + delta)}
    style={({ pressed }) => [styles.step, (value + delta < 1 || value + delta > MAX) && styles.stepOff, pressed && styles.pressed]}>
    <Text style={styles.stepText}>{text}</Text>
  </Pressable>;
  return <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 1, max: MAX, now: value }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={e => onChange(Math.max(1, Math.min(MAX, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
    <Text style={styles.stepLabel}>{label}</Text>
    <View style={styles.stepRow}>{button(-1, '−')}<Text style={styles.stepValue}>{value}</Text>{button(1, '+')}</View>
  </View>;
}

/** One small input per column or row; empty keeps the default name. */
function Labels({ title, values, base, onChange }: { title: string; values: string[]; base: string; onChange: (values: string[]) => void }) {
  return <View style={styles.labels}>
    <Text style={styles.fieldLabel}>{title}</Text>
    <View style={styles.chips}>
      {values.map((value, i) => <TextInput key={i} {...inputChrome} value={/^(col|fila)\d+:string$/.test(value) ? '' : shown(value)} accessibilityLabel={`${title} ${i + 1}`}
        placeholder={`${base} ${i + 1}`} placeholderTextColor={color.faint} maxLength={60} autoCorrect={false}
        onChangeText={text => onChange(values.map((v, j) => j === i ? text : v))} style={styles.chip} />)}
    </View>
  </View>;
}

/** Live preview: the phase grid exactly as it will be played, with its labels. */
function Preview({ width, height, phases, columns, rows }: { width: number; height: number; phases: number; columns: string[]; rows: string[] }) {
  const size = Math.max(14, Math.min(34, 220 / Math.max(width, height)));
  return <View style={styles.preview} accessible accessibilityLabel={`Vista previa: ${phases} fases de ${width} por ${height}`}>
    <View style={styles.previewHead}>
      {Array.from({ length: Math.min(phases, MAX) }, (_, i) => <View key={i} style={styles.phaseDot} />)}
      <Text style={styles.previewMeta}>{phases} {phases === 1 ? 'fase' : 'fases'} · {width} × {height}</Text>
    </View>
    <View style={styles.previewGrid}>
      <View style={[styles.previewRow, { marginLeft: 72 }]}>
        {Array.from({ length: width }, (_, c) => <Text key={c} numberOfLines={1} style={[styles.axisTop, { width: size + 6 }]}>{/^col\d+:string$/.test(columns[c] || '') ? `c${c + 1}` : shown(columns[c] || '') || `c${c + 1}`}</Text>)}
      </View>
      {Array.from({ length: height }, (_, r) => <View key={r} style={styles.previewRow}>
        <Text numberOfLines={1} style={styles.axisLeft}>{/^fila\d+:string$/.test(rows[r] || '') ? `fila ${r + 1}` : shown(rows[r] || '') || `fila ${r + 1}`}</Text>
        {Array.from({ length: width }, (_, c) => <View key={c} style={[styles.dot, { width: size, height: size, margin: 3 }]} />)}
      </View>)}
    </View>
  </View>;
}

/** «Crear nuevo cubo»: todas las fases comparten cuadrícula y etiquetas. Con `?id=`, guarda su versión siguiente. */
export default function CubeNew() {
  const { api, model } = useAccount();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [draft, setDraft] = useState<CubeDraft>(emptyDraft);
  const [version, setVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !model.cubes) return;
    api.cube(id).then(cube => { setDraft(fromCube(cube)); setVersion(cube.version); }, error => setNotice(errorMessage(error)));
  }, [api, id, model.cubes]);
  const back = () => router.canGoBack() ? router.back() : router.replace('/cubes');
  const set = (patch: Partial<CubeDraft>) => setDraft(current => ({ ...current, ...patch }));

  const phases = dimension(draft.phases) ?? 3, width = dimension(draft.width) ?? 3, height = dimension(draft.height) ?? 3;
  const columns = cells(draft.columns, width), rows = cells(draft.rows, height);
  const ready = !!draft.name.trim();

  async function create() {
    const cube = toCube(draft);
    if (!cube) { setNotice('Ponle un nombre al cubo.'); return; }
    setBusy(true); setNotice(null);
    try {
      const created = id ? await api.newVersion(id, cube) : await api.createCube(cube);
      router.replace({ pathname: '/cube', params: { id: created.cubeId } });
    } catch (error) { setNotice(errorMessage(error)); setBusy(false); }
  }

  const title = id ? (version ? `editar · v${version + 1}` : 'editar') : 'nuevo cubo';
  if (!model.cubes) return <Screen title={title} onBack={back}><EmptyState text="Crear cubos es para admin y superiores." /></Screen>;
  return (
    <Screen title={title} onBack={back}>
      <Section>
        <Field label="Nombre" value={draft.name} onChange={name => set({ name })} hint="Decidir el stack" />
        <Field label="Descripción (opcional, la ve quien abra el enlace)" value={draft.description} multiline
          onChange={description => set({ description })} hint="Qué es este cubo y para qué se usa" />
      </Section>
      <Preview width={width} height={height} phases={phases} columns={columns} rows={rows} />
      <Section label="forma">
        <View style={styles.steppers}>
          <Stepper label="fases" value={phases} onChange={n => set({ phases: String(n) })} />
          <Stepper label="columnas" value={width} onChange={n => set({ width: String(n), columns: joinCells(cells(draft.columns, n), 'col') })} />
          <Stepper label="filas" value={height} onChange={n => set({ height: String(n), rows: joinCells(cells(draft.rows, n), 'fila') })} />
        </View>
      </Section>
      <Section label="etiquetas">
        <Field label="Nombre de las fases" value={shown(draft.phaseLabel)} onChange={phaseLabel => set({ phaseLabel })} hint="fase" />
        <Labels title="columnas" base="columna" values={columns} onChange={values => set({ columns: joinCells(values, 'col') })} />
        <Labels title="filas" base="fila" values={rows} onChange={values => set({ rows: joinCells(values, 'fila') })} />
      </Section>
      <Text style={styles.note}>Todas las fases usan esta misma cuadrícula.{id ? ' Se guardará como versión nueva: las runs y los enlaces anteriores no cambian.' : ''}</Text>
      {notice && <EmptyState alert text={notice} />}
      <Pressable accessibilityRole="button" disabled={busy || (!!id && version === null)} onPress={() => void create()}
        style={({ pressed }) => [styles.submit, !ready && styles.submitOff, pressed && styles.pressed]}>
        <Text style={styles.submitText}>{busy ? '…' : id ? 'Guardar versión nueva' : 'Crear cubo'}</Text>
        <Text style={styles.submitArrow}>→</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space.s },
  fieldLabel: { fontSize: 12, color: color.muted, fontFamily: font.text, marginBottom: 4 },
  input: { borderBottomWidth: 1, borderBottomColor: color.ink, fontSize: 16, paddingVertical: space.xs, fontFamily: font.text, color: color.ink, outlineStyle: 'none' } as object,
  steppers: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  stepper: { flex: 1, minWidth: 96, gap: 6 },
  stepLabel: { fontSize: 12, color: color.muted, fontFamily: font.mono },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: color.line, borderRadius: 999, padding: 4 },
  step: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  stepOff: { opacity: 0.15 },
  stepText: { color: '#ffffff', fontSize: 20, lineHeight: 22 },
  stepValue: { fontSize: 22, color: color.ink, fontFamily: font.text, fontWeight: '300', minWidth: 28, textAlign: 'center' },
  labels: { marginTop: space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { width: '48%', borderWidth: 1, borderColor: color.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
    fontFamily: font.text, color: color.ink, outlineStyle: 'none' } as object,
  preview: { backgroundColor: color.paper, borderWidth: 1, borderColor: color.line, borderRadius: 20, padding: space.m, marginBottom: space.l, alignItems: 'center' },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: space.s, alignSelf: 'flex-start' },
  phaseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.axis },
  previewMeta: { fontSize: 12, color: color.muted, fontFamily: font.mono, marginLeft: 6 },
  previewGrid: { alignItems: 'flex-start' },
  previewRow: { flexDirection: 'row', alignItems: 'center' },
  axisTop: { fontSize: 9, color: color.muted, fontFamily: font.mono, textAlign: 'center' },
  axisLeft: { width: 72, fontSize: 10, color: color.muted, fontFamily: font.mono, paddingRight: 6, textAlign: 'right' },
  dot: { borderRadius: 999, backgroundColor: color.ink },
  note: { fontSize: 12, color: color.muted, fontFamily: font.text, marginBottom: space.s },
  submit: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: tap + 8, borderRadius: 999, backgroundColor: color.ink, paddingHorizontal: space.m, marginTop: space.s },
  submitOff: { opacity: 0.35 },
  submitText: { color: '#ffffff', fontSize: 16, fontFamily: font.text },
  submitArrow: { color: color.axis, fontSize: 18 },
  pressed: { opacity: 0.7 },
});
