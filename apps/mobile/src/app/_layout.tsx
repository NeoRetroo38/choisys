import { useState } from 'react';
import { Slot, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AccountProvider } from '../account/AccountProvider';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import WelcomeScreen from '../screens/WelcomeScreen';

function AuthenticatedRoutes() {
  const { controller, state } = useAuth();
  if (state.status === 'loading' || state.status === 'error') {
    return <View style={styles.loading}>
      <Text style={styles.brand}>choisys</Text>
      {state.status === 'loading' ? <ActivityIndicator color="#000000" accessibilityLabel="Comprobando sesión" /> : <>
        <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>
        <Pressable accessibilityRole="button" style={styles.retry} onPress={() => void controller.bootstrap()}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </>}
    </View>;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#ffffff' }, animation: 'slide_from_right', gestureEnabled: true }}>
    <Stack.Protected guard={state.status === 'signedIn'}>
      <Stack.Screen name="index" /><Stack.Screen name="account" /><Stack.Screen name="system" />
      <Stack.Screen name="cubes" /><Stack.Screen name="cube-new" /><Stack.Screen name="cube" /><Stack.Screen name="play" /><Stack.Screen name="share" /><Stack.Screen name="cube-style" />
    </Stack.Protected>
    <Stack.Protected guard={state.status === 'signedOut'}>
      <Stack.Screen name="sign-in" /><Stack.Screen name="register" />
    </Stack.Protected>
  </Stack>;
}

// The welcome is shown once per browser tab: a reload keeps the screen you were on. Web only; native starts fresh.
const WELCOMED = 'choisys.welcomed';
const seenWelcome = () => { try { return globalThis.sessionStorage?.getItem(WELCOMED) === '1'; } catch { return false; } };
const rememberWelcome = () => { try { globalThis.sessionStorage?.setItem(WELCOMED, '1'); } catch { /* private mode: show it again */ } };

export default function RootLayout() {
  const [welcomed, setWelcomed] = useState(seenWelcome);
  // A shared cube is opened by people without an account: no welcome, no sign-in, no account providers.
  if (usePathname().startsWith('/c/')) return <><StatusBar style="light" /><Slot /></>;
  if (!welcomed) return <><StatusBar style="light" /><WelcomeScreen onContinue={() => { rememberWelcome(); setWelcomed(true); }} /></>;
  return <AuthProvider><AccountProvider><StatusBar style="dark" /><AuthenticatedRoutes /></AccountProvider></AuthProvider>;
}
const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', gap: 28, padding: 32 },
  brand: { fontSize: 32, color: '#000000', fontWeight: '400' },
  error: { color: '#444444', textAlign: 'center', lineHeight: 22 },
  retry: { borderRadius: 30, backgroundColor: '#000000', paddingVertical: 16, paddingHorizontal: 32 },
  retryText: { color: '#ffffff', fontSize: 16 },
});
