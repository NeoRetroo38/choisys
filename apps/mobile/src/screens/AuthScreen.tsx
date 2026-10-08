import { useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RoleChoice, { type RoleOption } from '../ui/RoleChoice';

interface AuthScreenProps {
  mode: 'login' | 'register';
  busy: boolean;
  error: string | null;
  onSubmit: (input: { email: string; password: string; displayName: string; requestedRole?: string }) => void;
  onModeChange: () => void;
  /** Account types offered at sign-up; the first one is the default (plain user). Absent: no choice shown. */
  roleOptions?: RoleOption[];
}

export default function AuthScreen({ mode, busy, error, onSubmit, onModeChange, roleOptions }: AuthScreenProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [requestedRole, setRequestedRole] = useState(roleOptions?.[0]?.value);
  const [validationError, setValidationError] = useState<string | null>(null);
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const register = mode === 'register';

  // Switching between login and register clears the password and any validation message.
  const [shownMode, setShownMode] = useState(mode);
  if (shownMode !== mode) {
    setShownMode(mode);
    setPassword('');
    setValidationError(null);
  }

  function submit() {
    if (busy) return;
    if (!email.trim() || !password || (register && !displayName.trim())) {
      setValidationError('Completa todos los campos para continuar.');
      return;
    }
    setValidationError(null);
    onSubmit({ email: email.trim(), password, displayName: displayName.trim(),
      ...(register && requestedRole && requestedRole !== roleOptions?.[0]?.value ? { requestedRole } : {}) });
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        contentContainerStyle={[styles.content, {
          minHeight: height,
          paddingTop: Math.max(insets.top + 36, height * 0.12),
          paddingBottom: insets.bottom + 32,
        }]}>
        <Text style={styles.brand}>choisys</Text>
        <View style={styles.form}>
          <Text accessibilityRole="header" style={styles.title}>
            {register ? 'crear cuenta.' : 'iniciar sesión.'}
          </Text>
          <Text style={styles.subtitle}>
            {register ? 'Tu espacio para elegir.' : 'Continúa donde empieza tu elección.'}
          </Text>

          {register && <View style={styles.field}>
            <Text style={styles.label}>Nombre</Text>
            <TextInput accessibilityLabel="Nombre" value={displayName} onChangeText={setDisplayName}
              editable={!busy} style={styles.input} placeholder="Tu nombre" placeholderTextColor="#777777"
              autoCapitalize="words" autoComplete={Platform.OS === 'ios' ? undefined : 'name'}
              textContentType={Platform.OS === 'ios' ? 'name' : undefined}
              returnKeyType="next" onSubmitEditing={() => emailInput.current?.focus()}
              maxLength={100} />
          </View>}

          <View style={styles.field}>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput ref={emailInput} accessibilityLabel="Correo electrónico" value={email}
              onChangeText={setEmail} editable={!busy} style={styles.input}
              placeholder="tu@correo.com" placeholderTextColor="#777777" keyboardType="email-address"
              autoCapitalize="none" autoCorrect={false}
              autoComplete={Platform.OS === 'ios' ? undefined : 'email'}
              textContentType={Platform.OS === 'ios' ? 'emailAddress' : undefined}
              returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()}
              maxLength={254} />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput key={mode} ref={passwordInput} accessibilityLabel="Contraseña"
              value={password} onChangeText={setPassword} editable={!busy} style={styles.input}
              placeholder={register ? 'Crea tu contraseña' : 'Tu contraseña'} placeholderTextColor="#777777"
              autoCapitalize="none" autoCorrect={false} secureTextEntry
              autoComplete={Platform.OS === 'ios' ? undefined : register ? 'new-password' : 'current-password'}
              textContentType={Platform.OS === 'ios' ? register ? 'newPassword' : 'password' : undefined}
              returnKeyType="go" onSubmitEditing={submit} maxLength={128} />
          </View>

          {register && roleOptions && roleOptions.length > 1 && <View style={styles.field}>
            <Text style={styles.label}>Tipo de cuenta</Text>
            <RoleChoice options={roleOptions} value={requestedRole} onChange={setRequestedRole} disabled={busy} />
            {requestedRole !== roleOptions[0].value && <Text style={styles.roleHint}>
              Entras como usuario. Un sudev revisará tu solicitud y lo verás en «tú».
            </Text>}
          </View>}

          {(validationError || error) && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={styles.error}>{validationError || error}</Text>}

          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}
            onPress={submit} disabled={busy}
            style={({ pressed }) => [styles.submit, busy && styles.disabled, pressed && styles.pressed]}>
            {busy && <ActivityIndicator color="#ffffff" size="small" />}
            <Text style={styles.submitText}>{busy ? 'Un momento…' : register ? 'Crear cuenta' : 'Entrar'}</Text>
          </Pressable>

          <Pressable accessibilityRole="button" onPress={onModeChange} disabled={busy}
            style={({ pressed }) => [styles.switchMode, busy && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.switchText}>
              {register ? '¿Ya tienes cuenta? ' : '¿Es tu primera vez? '}
              <Text style={styles.switchLink}>{register ? 'Inicia sesión' : 'Regístrate'}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fdfdfd' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 40 },
  brand: { fontSize: 34, fontWeight: '400', letterSpacing: -1.2, color: '#000000' },
  form: { marginTop: 66 },
  title: { fontSize: 30, fontWeight: '400', lineHeight: 38, letterSpacing: -0.8, color: '#000000' },
  subtitle: { marginTop: 10, marginBottom: 34, color: '#666666', fontSize: 14, lineHeight: 21 },
  field: { marginBottom: 23 },
  label: { color: '#333333', fontSize: 12, lineHeight: 18 },
  input: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: '#bdbdbd', paddingVertical: 10,
    paddingHorizontal: 0, fontSize: 16, color: '#000000' },
  error: { color: '#333333', fontSize: 14, lineHeight: 21, marginTop: 2, marginBottom: 16 },
  submit: { minHeight: 52, backgroundColor: '#000000', borderRadius: 28, paddingHorizontal: 20,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, marginTop: 9 },
  submitText: { color: '#ffffff', fontSize: 16, fontWeight: '400' },
  switchMode: { minHeight: 48, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  switchText: { color: '#666666', fontSize: 13, lineHeight: 21, textAlign: 'center' },
  switchLink: { color: '#000000', textDecorationLine: 'underline' },
  roleHint: { marginTop: 10, color: '#666666', fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.65 },
});
