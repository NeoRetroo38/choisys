import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { createProductClient } from '../productApi';
import ExperienceScreen from '../screens/ExperienceScreen';

export default function Home() {
  const { controller, state } = useAuth();
  const client = useMemo(() => createProductClient(process.env.EXPO_PUBLIC_API_URL, fetch, 8000,
    () => controller.getState().token), [controller]);
  return <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
    {state.error && <Text accessibilityRole="alert" style={{ padding: 18, paddingTop: 50, textAlign: 'center' }}>{state.error}</Text>}
    <ExperienceScreen client={client} onSignOut={() => void controller.signOut()} onUnauthorized={() => void controller.bootstrap()} />
  </View>;
}
