import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import type { CubeSummary } from '@scenarys/shared';
import { useAccount } from '../account/AccountProvider';
import { errorMessage } from '../api/request';
import ActionRow from '../ui/ActionRow';
import EmptyState from '../ui/EmptyState';
import Screen from '../ui/Screen';
import Section from '../ui/Section';

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

  if (!model.cubes) return <Screen title="mis cubos" onBack={back}><EmptyState text="Crear cubos es para admin y superiores." /></Screen>;
  return (
    <Screen title="mis cubos" onBack={back}>
      {notice && <EmptyState alert text={notice} />}
      <Section>
        <ActionRow label="Crear nuevo cubo" value="+" onPress={() => router.push('/cube-new')} />
      </Section>
      <Section label="tus cubos">
        {cubes === null ? <EmptyState text="…" /> : cubes.length === 0 ? <EmptyState text="Aún no has creado ningún cubo." /> :
          cubes.map(cube => <ActionRow key={cube.cubeId} label={cube.name} value="→"
            detail={`${cube.phases} ${cube.phases === 1 ? 'fase' : 'fases'} · v${cube.version} · ${cube.runs} ${cube.runs === 1 ? 'run' : 'runs'}`}
            onPress={() => router.push({ pathname: '/cube', params: { id: cube.cubeId } })} />)}
      </Section>
    </Screen>
  );
}
