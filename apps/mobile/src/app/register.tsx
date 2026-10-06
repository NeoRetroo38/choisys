import { router } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import AuthScreen from '../screens/AuthScreen';

export default function Register() {
  const { state, controller } = useAuth();
  return <AuthScreen mode="register" busy={state.status === 'loading'} error={state.error}
    onSubmit={input => void controller.register(input)} onModeChange={() => router.replace('/sign-in')} />;
}
