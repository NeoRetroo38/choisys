import { router } from 'expo-router';
import { roleLabel, roleMeaning } from '../account/capabilities';
import type { RegisterCredentials } from '../auth/sessionController';
import { useAuth } from '../auth/AuthProvider';
import AuthScreen from '../screens/AuthScreen';

/**
 * Role requests need the back-end contract (issue "Registro con solicitud de rol"). Until it is in main the API
 * rejects unknown fields, so the choice only appears when EXPO_PUBLIC_ROLE_REQUESTS=1.
 */
const roleRequests = process.env.EXPO_PUBLIC_ROLE_REQUESTS === '1';
const roleOptions = (['USER', 'ADMIN', 'DEV', 'SUPERDEV'] as const).map(value => ({ value, label: roleLabel[value], meaning: roleMeaning[value] }));

export default function Register() {
  const { state, controller } = useAuth();
  return <AuthScreen mode="register" busy={state.status === 'loading'} error={state.error}
    roleOptions={roleRequests ? roleOptions : undefined}
    onSubmit={input => void controller.register(input as RegisterCredentials)} onModeChange={() => router.replace('/sign-in')} />;
}
