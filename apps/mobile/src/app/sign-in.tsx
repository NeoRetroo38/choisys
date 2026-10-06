import { router } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import AuthScreen from '../screens/AuthScreen';

export default function SignIn() {
  const { state, controller } = useAuth();
  return <AuthScreen mode="login" busy={state.status === 'loading'} error={state.error}
    onSubmit={({ email, password }) => void controller.signIn({ email, password })}
    onModeChange={() => router.replace('/register')} />;
}
