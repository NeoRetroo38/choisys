import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import type { CubeDetail } from '@scenarys/shared';
import { useAccount } from '../account/AccountProvider';
import { errorMessage } from '../api/request';
import ActionRow from '../ui/ActionRow';
import EmptyState from '../ui/EmptyState';
import Screen from '../ui/Screen';
import Section from '../ui/Section';
import { color, font, space } from '../ui/theme';

/** Un cubo propio: su estructura (fases, filas y columnas con su semántica) y sus runs, que se pueden ocultar sin borrarlas. */
export default function Cube() {
  const { api, model } = useAccount();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [cube, setCube] = useState<CubeDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace('/cubes');
  useFocusEffect(useCallback(() => {
    if (!model.cubes || !id) return;
    api.cube(id).then(setCube, error => setNotice(errorMessage(error)));
  }, [api, model.cubes, id]));

  async function toggle(runId: string, hidden: boolean) {
    if (!cube) return;
    setBusy(runId);
    try { setCube(await api.setRunHidden(cube.cubeId, runId, hidden)); } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(null); }
  }

  async function publish(referenceRunId: string) {
    if (!cube) return;
    setBusy('publish');
    try {
      const share = await api.createShare(cube.cubeId, referenceRunId);
      router.push({ pathname: '/share', params: { cube: cube.cubeId, id: share.shareId } });
    } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(null); }
  }

  if (!model.cubes) return <Screen title="cubo" onBack={back}><EmptyState text="Crear cubos es para admin y superiores." /></Screen>;
  if (!cube) return <Screen title="cubo" onBack={back}><EmptyState alert={!!notice} text={notice ?? '…'} /></Screen>;
  const reference = cube.runs.find(run => run.status === 'COMPLETED' && run.version === cube.version && run.measurements.length === cube.phases.length);
  const openShares = cube.shares.filter(share => share.open).length;
  return (
    <Screen title={cube.name} onBack={back}>
      {notice && <EmptyState alert text={notice} />}
      {cube.description && <Text style={styles.description}>{cube.description}</Text>}
      <Text style={styles.meta}>v{cube.version} · {cube.phases.length} {cube.phases.length === 1 ? 'fase' : 'fases'}{openShares > 0 ? ' · referencia publicada' : ''}</Text>
      <Section>
        <ActionRow label="Jugar este cubo" value="→" onPress={() => router.push({ pathname: '/play', params: { cube: cube.cubeId } })} />
        <ActionRow label="Editar estructura" value="→" detail={`Crea la v${cube.version + 1}. Lo ya publicado sigue en su versión.`}
          onPress={() => router.push({ pathname: '/cube-new', params: { id: cube.cubeId } })} />
      </Section>
      <Section label="compartir">
        {reference ? <ActionRow label="Publicar como referencia" value="→" busy={busy === 'publish'}
          detail={`Tu última run de la v${cube.version} será el patrón con el que se compara a quien responda por el enlace.`}
          onPress={() => void publish(reference.runId)} />
          : <EmptyState text={`Juega la v${cube.version} una vez: esa run será la referencia.`} />}
        {cube.shares.map(share => <ActionRow key={share.shareId} label={`enlace · v${share.version} · ${share.open ? 'abierto' : 'cerrado'}`}
          detail={new Date(share.createdAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          value={`${share.participants} ${share.participants === 1 ? 'participante' : 'participantes'} →`}
          onPress={() => router.push({ pathname: '/share', params: { cube: cube.cubeId, id: share.shareId } })} />)}
      </Section>
      {cube.phases.map((phase, index) => <Section key={index} label={`fase ${index + 1} · ${phase.label}`}>
        <Text style={styles.shape}>{phase.columns.length} × {phase.rows.length}</Text>
        <View style={styles.grid}>
          {phase.rows.map((_, row) => <View key={row} style={styles.gridRow}>
            {phase.columns.map((__, column) => <View key={column} style={styles.cell} />)}
          </View>)}
        </View>
        <Text style={styles.axis}>columnas: {phase.columns.join(' · ')}</Text>
        <Text style={styles.axis}>filas: {phase.rows.join(' · ')}</Text>
      </Section>)}
      <Section label="runs">
        {cube.runs.length === 0 ? <EmptyState text="Este cubo aún no tiene runs." /> :
          cube.runs.map(run => <ActionRow key={run.runId} busy={busy === run.runId}
            label={new Date(run.startedAt).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            detail={run.measurements.map(m => `${m.phase}:${m.row}·${m.column}`).join('  ') || run.status.toLowerCase()}
            value={run.hidden ? 'oculta' : 'visible'} onPress={() => void toggle(run.runId, !run.hidden)}
            accessibilityHint={run.hidden ? 'Vuelve a mostrar esta run' : 'Oculta esta run sin borrarla'} />)}
      </Section>
    </Screen>
  );
}

const cellSize = 14;
const styles = StyleSheet.create({
  description: { fontSize: 15, lineHeight: 23, color: color.ink, fontFamily: font.text, fontWeight: '300', marginBottom: space.s },
  meta: { fontSize: 12, color: color.muted, fontFamily: font.mono, marginBottom: space.m },
  shape: { fontSize: 13, color: color.ink, fontFamily: font.mono, marginBottom: space.xs },
  grid: { alignSelf: 'flex-start', gap: 3, marginBottom: space.s },
  gridRow: { flexDirection: 'row', gap: 3 },
  cell: { width: cellSize, height: cellSize, borderWidth: 1, borderColor: color.ink },
  axis: { fontSize: 12, lineHeight: 18, color: color.muted, fontFamily: font.text },
});
