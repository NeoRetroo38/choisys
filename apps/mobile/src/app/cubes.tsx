import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import type { CubeSummary } from '@scenarys/shared';
import { useAccount } from '../account/AccountProvider';
import { errorMessage } from '../api/request';
import ActionRow from '../ui/ActionRow';
import EmptyState from '../ui/EmptyState';
import Screen from '../ui/Screen';
import Section from '../ui/Section';
import { StyleSheet, Text } from 'react-native';
import { color, font, space } from '../ui/theme';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Counts as the server sent them: cubes, published references and people who answered by link. */
const summary = (cubes: CubeSummary[]) => [
  plural(cubes.length, 'cubo', 'cubos'),
  plural(cubes.filter(c => c.openShares > 0).length, 'referencia publicada', 'referencias publicadas'),
  plural(cubes.reduce((total, c) => total + c.participants, 0), 'participante', 'participantes'),
].join(' · ');

/** «Mis cubos»: los cubos que ha creado esta persona (admin y superiores). */
export default function Cubes() {
  const { api, model } = useAccount();
  const [cubes, setCubes] = useState<CubeSummary[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace('/account');
  useFocusEffect(useCallback(() => {
    if (!model.cubes) return;
    api.cubes().then(setCubes, error => { setCubes([]); setNotice(errorMessage(error)); });
  }, [api, model.cubes]));

  const active = (cubes ?? []).filter(cube => !cube.archived), archived = (cubes ?? []).filter(cube => cube.archived);
  const row = (cube: CubeSummary) => <ActionRow key={cube.cubeId} label={cube.name} value="→"
    detail={`${cube.openShares > 0 ? 'referencia · publicado · ' : ''}${cube.phases} ${cube.phases === 1 ? 'fase' : 'fases'} · v${cube.version} · ${cube.runs} ${cube.runs === 1 ? 'run' : 'runs'}${cube.participants > 0 ? ` · ${cube.participants} ${cube.participants === 1 ? 'participante' : 'participantes'}` : ''}`}
    onPress={() => router.push({ pathname: '/cube', params: { id: cube.cubeId } })} />;
  if (!model.cubes) return <Screen title="mis cubos" onBack={back}><EmptyState text="Crear cubos es para admin y superiores." /></Screen>;
  return (
    <Screen title="mis cubos" onBack={back}>
      {notice && <EmptyState alert text={notice} />}
      {active.length > 0 && <Text style={styles.summary}>{summary(active)}</Text>}
      <Section>
        <ActionRow label="Crear nuevo cubo" value="+" onPress={() => router.push('/cube-new')} />
      </Section>
      <Section label="tus cubos">
        {cubes === null ? <EmptyState text="…" /> : active.length === 0 ? <EmptyState text="Aún no has creado ningún cubo." /> : active.map(row)}
      </Section>
      {archived.length > 0 && <Section label="archivados">{archived.map(row)}</Section>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { fontSize: 12, color: color.muted, fontFamily: font.mono, marginBottom: space.m },
});
