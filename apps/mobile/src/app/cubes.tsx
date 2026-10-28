import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CubeSummary } from '@scenarys/shared';
import { useAccount } from '../account/AccountProvider';
import { errorMessage } from '../api/request';
import { cubeStatus, filterCubes, type CubeFilter } from '../cubes/cubeStatus';
import CubeRow from '../ui/CubeRow';
import EmptyState from '../ui/EmptyState';
import Screen from '../ui/Screen';
import { color, font, space, tap } from '../ui/theme';

const filters: Array<{ id: CubeFilter; label: string }> = [
  { id: 'todos', label: 'activos' }, { id: 'publicado', label: 'publicados' }, { id: 'personal', label: 'personales' }, { id: 'archivado', label: 'archivados' },
];
const empty: Record<CubeFilter, string> = {
  todos: 'Aún no has creado ningún cubo. Empieza con uno de 3 fases y una cuadrícula de 3 × 3.',
  publicado: 'Ningún cubo tiene una referencia publicada. Juega uno y publícalo desde su ficha.',
  personal: 'No tienes cubos sin publicar.',
  archivado: 'No hay cubos archivados.',
};

/** «Mis cubos»: el centro de choisys para quien crea cubos (admin y superiores). */
export default function Cubes() {
  const { api, model } = useAccount();
  const [cubes, setCubes] = useState<CubeSummary[] | null>(null);
  const [filter, setFilter] = useState<CubeFilter>('todos');
  const [notice, setNotice] = useState<string | null>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace('/account');
  useFocusEffect(useCallback(() => {
    if (!model.cubes) return;
    api.cubes().then(setCubes, error => { setCubes([]); setNotice(errorMessage(error)); });
  }, [api, model.cubes]));

  if (!model.cubes) return <Screen title="mis cubos" onBack={back}><EmptyState text="Crear cubos es para admin y superiores." /></Screen>;
  const all = cubes ?? [];
  const count = (id: CubeFilter) => id === 'todos' ? all.filter(c => !c.archived).length : all.filter(c => cubeStatus(c) === id).length;
  const shown = filterCubes(all, filter);
  return (
    <Screen title="mis cubos" onBack={back}>
      {notice && <EmptyState alert text={notice} />}
      <Pressable accessibilityRole="button" onPress={() => router.push('/cube-new')} style={({ pressed }) => [styles.create, pressed && styles.pressed]}>
        <Text style={styles.createPlus}>+</Text>
        <View><Text style={styles.createText}>Crear nuevo cubo</Text><Text style={styles.createHint}>fases, filas y columnas a tu medida</Text></View>
      </Pressable>
      {all.length > 0 && <View style={styles.filters} accessibilityRole="tablist">
        {filters.map(item => {
          const selected = filter === item.id;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setFilter(item.id)}
            style={[styles.filter, selected && styles.filterOn]}>
            <Text style={[styles.filterText, selected && styles.filterTextOn]}>{item.label} {count(item.id)}</Text>
          </Pressable>;
        })}
      </View>}
      {cubes === null ? <EmptyState text="…" /> : shown.length === 0 ? <EmptyState text={empty[filter]} />
        : shown.map(cube => <CubeRow key={cube.cubeId} cube={cube} onPress={() => router.push({ pathname: '/cube', params: { id: cube.cubeId } })} />)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  create: { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: tap + 16, borderRadius: 999, backgroundColor: color.ink,
    paddingHorizontal: space.m, marginBottom: space.m },
  pressed: { opacity: 0.7 },
  createPlus: { fontSize: 28, color: color.axis, fontWeight: '300' },
  createText: { fontSize: 16, color: '#ffffff', fontFamily: font.text },
  createHint: { fontSize: 11, color: '#9a9a9a', fontFamily: font.mono },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.s },
  filter: { borderWidth: 1, borderColor: color.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  filterOn: { borderColor: color.ink, backgroundColor: color.ink },
  filterText: { fontSize: 12, color: color.ink, fontFamily: font.mono },
  filterTextOn: { color: '#ffffff' },
});
