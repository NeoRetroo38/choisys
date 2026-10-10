import { useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { createProductClient } from '../productApi';
import ExperienceScreen from '../screens/ExperienceScreen';

/** Jugar un cubo propio: exactamente la misma interfaz que el vanilla, con la forma del cubo. */
export default function Play() {
  const { controller } = useAuth();
  const { cube } = useLocalSearchParams<{ cube?: string }>();
  const client = useMemo(() => createProductClient(process.env.EXPO_PUBLIC_API_URL, fetch, 8000,
    () => controller.getState().token), [controller]);
  const back = () => cube ? router.replace({ pathname: '/cube', params: { id: cube } }) : router.replace('/');
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
    <ExperienceScreen key={cube} client={client} cubeId={cube} onSignOut={() => void controller.signOut()}
      onAccount={back} onUnauthorized={() => void controller.bootstrap()} />
  </View>;
}
