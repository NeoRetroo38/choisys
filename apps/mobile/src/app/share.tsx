import { useCallback, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { CubeShape, CubeShareDetail, ShareParticipant } from '@scenarys/shared';
import { useAccount } from '../account/AccountProvider';
import { errorMessage } from '../api/request';
import CubeView from '../screens/CubeView';
import { linkFor } from '../shares/linkFor';
import { participantRows, type ParticipantFilter, type ParticipantOrder } from '../shares/participants';
import ActionRow from '../ui/ActionRow';
import EmptyState from '../ui/EmptyState';
import Screen from '../ui/Screen';
import Section from '../ui/Section';
import { color, font, space, tap } from '../ui/theme';

const when = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const percent = (value: number) => `${value.toFixed(1)} %`;

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return <View style={styles.choice}>
    {options.map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: value === key }} onPress={() => onChange(key)}
      style={({ pressed }) => [styles.choiceItem, pressed && styles.pressed]}>
      <Text style={[styles.choiceText, value === key && styles.choiceOn]}>{label}</Text>
    </Pressable>)}
  </View>;
}

/** Reference and participant side by side; per-phase similarity as the engine returned it. */
function Comparison({ share, person, shape }: { share: CubeShareDetail; person: ShareParticipant; shape: CubeShape }) {
  const { width } = useWindowDimensions();
  const latest = person.runs[0];
  const size = Math.min(Math.max(Math.floor((Math.min(width, 560) - space.m * 3) / 2), 150), 260);
  return <View style={styles.night}>
    <View style={styles.pair}>
      <View style={styles.side}><Text style={styles.nightLabel}>referencia</Text>
        <CubeView runs={[share.reference]} shape={shape} size={size} caption="cubo de referencia" /></View>
      <View style={styles.side}><Text style={styles.nightLabel}>{person.displayName}</Text>
        {latest ? <CubeView runs={person.runs.slice().reverse().map(run => run.measurements)} shape={shape} size={size} caption={`${person.runs.length} ${person.runs.length === 1 ? 'run' : 'runs'}`} />
          : <Text style={styles.nightCopy}>Aún no ha completado ninguna run.</Text>}</View>
    </View>
    {latest?.comparison ? <>
      <Text style={styles.nightValue}>{percent(latest.comparison.similarity)}</Text>
      <Text style={styles.nightCopy}>similitud de su última run con el cubo de referencia</Text>
      {latest.comparison.phases.map(phase => <Text key={phase.phase} style={styles.phase}>fase {phase.phase} · {percent(phase.similarity)}</Text>)}
    </> : latest && <Text style={styles.nightCopy}>Comparación pendiente: el motor no estaba disponible. Se calculará al volver a abrir.</Text>}
    {person.runs.map(run => <Text key={run.runId} style={styles.runLine}>
      {when(run.completedAt)}  {run.measurements.map(m => `${m.phase}:${m.row}·${m.column}`).join(' ')}{run.comparison ? `  ${percent(run.comparison.similarity)}` : ''}
    </Text>)}
  </View>;
}

/** One link of a reference cube: copy it, close it, and see who answered, ranked by the engine's similarity. */
export default function Share() {
  const { api, model } = useAccount();
  const { cube, id } = useLocalSearchParams<{ cube?: string; id?: string }>();
  const [share, setShare] = useState<CubeShareDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<ParticipantOrder>('similarity');
  const [filter, setFilter] = useState<ParticipantFilter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace({ pathname: '/cube', params: { id: cube ?? '' } });
  useFocusEffect(useCallback(() => {
    if (!model.cubes || !cube || !id) return;
    api.share(cube, id).then(setShare, error => setNotice(errorMessage(error)));
  }, [api, model.cubes, cube, id]));

  if (!model.cubes) return <Screen title="enlace" onBack={back}><EmptyState text="Crear cubos es para admin y superiores." /></Screen>;
  if (!share || !cube) return <Screen title="enlace" onBack={back}><EmptyState alert={!!notice} text={notice ?? '…'} /></Screen>;
  const url = linkFor(share.token);
  const shape = { phases: share.phases.length, rows: share.phases[0].rows.length, columns: share.phases[0].columns.length };
  const rows = participantRows(share.participants, order, filter);
  const completed = share.participants.filter(p => p.runs.length > 0).length;

  async function copy() {
    if (await Clipboard.setStringAsync(url).catch(() => false) === false) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  async function close() {
    if (!confirmClose) { setConfirmClose(true); return; }
    setBusy(true);
    try { setShare(await api.closeShare(cube!, share!.shareId)); } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(false); setConfirmClose(false); }
  }

  return (
    <Screen title={`enlace · v${share.version}`} onBack={back}>
      {notice && <EmptyState alert text={notice} />}
      <Section>
        <Text selectable style={styles.url}>{url}</Text>
        <Text style={styles.meta}>{share.open ? 'abierto' : 'cerrado'} · {share.participants.length} {share.participants.length === 1 ? 'participante' : 'participantes'} · {completed} {completed === 1 ? 'completado' : 'completados'}</Text>
        <ActionRow label="Copiar enlace" value={copied ? 'copiado' : '⧉'} onPress={() => void copy()} />
        {share.open && <ActionRow label={confirmClose ? 'Pulsa otra vez para cerrar' : 'Cerrar enlace'} tone="danger" busy={busy}
          detail="Nadie más podrá responder. Los resultados se conservan." onPress={() => void close()} />}
      </Section>

      <Section label="participantes">
        <Text style={styles.note}>Similitud con el cubo de referencia: proximidad dentro de la cuadrícula de este cubo, calculada por el Cubo de Neo. No mide a la persona; la decisión es tuya.</Text>
        <Choice value={order} onChange={setOrder} options={[['similarity', 'similitud'], ['date', 'fecha'], ['name', 'nombre']]} />
        <Choice value={filter} onChange={setFilter} options={[['all', 'todos'], ['completed', 'completados'], ['pending', 'sin completar']]} />
        {share.participants.length === 0 ? <EmptyState text="Aún no ha entrado nadie con este enlace." /> :
          rows.length === 0 ? <EmptyState text="Nadie en este filtro." /> :
          rows.map(person => {
            const latest = person.runs[0];
            return <View key={person.participantId}>
              <ActionRow label={`${person.rank ?? '–'}  ${person.displayName}`}
                detail={[person.email, latest ? when(latest.completedAt) : `entró ${when(person.joinedAt)}`].filter(Boolean).join(' · ')}
                value={!latest ? 'sin completar' : latest.comparison ? percent(latest.comparison.similarity) : 'pendiente'}
                accessibilityHint="Muestra su cubo junto al de referencia"
                onPress={() => setOpen(current => current === person.participantId ? null : person.participantId)} />
              {open === person.participantId && <Comparison share={share} person={person} shape={shape} />}
            </View>;
          })}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  url: { fontSize: 13, lineHeight: 19, color: color.ink, fontFamily: font.mono, marginBottom: space.xs },
  meta: { fontSize: 12, color: color.muted, fontFamily: font.mono, marginBottom: space.s },
  note: { fontSize: 12, lineHeight: 18, color: color.muted, fontFamily: font.text, marginBottom: space.s },
  choice: { flexDirection: 'row', flexWrap: 'wrap', gap: space.m, marginBottom: space.xs },
  choiceItem: { minHeight: tap - 8, justifyContent: 'center' },
  choiceText: { fontSize: 13, color: color.muted, fontFamily: font.text },
  choiceOn: { color: color.ink, textDecorationLine: 'underline' },
  night: { backgroundColor: color.night, padding: space.m, marginVertical: space.s },
  pair: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.m },
  side: { alignItems: 'center' },
  nightLabel: { color: '#8a8a8a', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', fontFamily: font.text, marginBottom: space.xs },
  nightValue: { color: color.current, fontSize: 40, fontFamily: font.text, fontWeight: '300', textAlign: 'center', marginTop: space.m },
  nightCopy: { color: '#8a8a8a', fontSize: 12, lineHeight: 18, fontFamily: font.text, textAlign: 'center', marginVertical: space.xs },
  phase: { color: color.axis, fontSize: 12, fontFamily: font.mono, textAlign: 'center', marginTop: 2 },
  runLine: { color: '#bdbdbd', fontSize: 11, fontFamily: font.mono, marginTop: space.xs },
  pressed: { opacity: 0.55 },
});
