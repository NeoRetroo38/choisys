import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import type { RunSummary } from '@scenarys/shared';
import { useAccount } from '../account/AccountProvider';
import { roleLabel } from '../account/capabilities';
import { deliverExport } from '../account/exportData';
import { errorMessage } from '../api/request';
import { CONTACT_PHONE, useCopyPhone } from '../contact';
import { useAuth } from '../auth/AuthProvider';
import type { RunMeasurements } from '../history/runHistory';
import CubeView from '../screens/CubeView';
import ActionRow from '../ui/ActionRow';
import EmptyState from '../ui/EmptyState';
import ProfileHeader from '../ui/ProfileHeader';
import Screen from '../ui/Screen';
import Section from '../ui/Section';
import { color, font, space, inputChrome } from '../ui/theme';

/** Everything about "me" on one screen: who I am, my cube, my data, my session. */
export default function Account() {
  const account = useAccount();
  const { controller } = useAuth();
  const { width } = useWindowDimensions();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, copyPhone] = useCopyPhone();
  const back = () => router.canGoBack() ? router.back() : router.replace('/');
  const { model, profile, api, roleRequest } = account;
  const refresh = account.refresh;
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const requestLine = roleRequest && {
    PENDING: `Pediste ${roleLabel[roleRequest.requestedRole]}. Un sudev lo revisará; mientras, eres usuario.`,
    APPROVED: `Tu solicitud de ${roleLabel[roleRequest.requestedRole]} fue aprobada.`,
    REJECTED: `Tu solicitud de ${roleLabel[roleRequest.requestedRole]} no se aprobó. Sigues como ${roleLabel[profile?.role ?? 'USER']}.`,
  }[roleRequest.status];

  useEffect(() => {
    if (!model.account.history) return;
    api.runs().then(setRuns, error => { setRuns([]); setNotice(errorMessage(error)); });
  }, [api, model.account.history]);

  if (account.status === 'loading') return <Screen title="tú" onBack={back}><EmptyState text="…" /></Screen>;
  if (!profile || !model.account.visible) {
    return <Screen title="tú" onBack={back}>
      <EmptyState alert text={account.status === 'unavailable' ? 'Este servidor aún no guarda cuentas.' : 'No hemos podido cargar tu cuenta.'}
        action="Reintentar" onAction={() => void account.refresh()} />
      <ActionRow label="Cerrar sesión" onPress={() => void controller.signOut()} />
    </Screen>;
  }

  // Oldest first, as CubeView draws the last one as the current Run.
  const completed: RunMeasurements[] = (runs ?? []).filter(run => run.status === 'COMPLETED' && run.measurements.length === 3)
    .map(run => run.measurements).reverse().slice(-5);

  async function exportData() {
    setBusy('export'); setNotice(null);
    try { await deliverExport(await api.export()); } catch (error) { setNotice(errorMessage(error)); } finally { setBusy(null); }
  }

  async function deleteAccount() {
    if (!password) return;
    setBusy('delete'); setNotice(null);
    try {
      await api.deleteAccount(password);
      await controller.bootstrap(); // the token is gone with the account: this returns to sign-in.
    } catch (error) { setNotice(errorMessage(error)); setBusy(null); }
  }

  return (
    <Screen title="tú" onBack={back}>
      <ProfileHeader name={profile.displayName} role={profile.role} since={profile.createdAt}
        onRename={model.account.rename ? async name => {
          try { const me = await api.rename(name); account.setProfile(me.profile, me.capabilities, me.roleRequest); }
          catch (error) { setNotice(errorMessage(error)); }
        } : undefined} />

      {requestLine && <Text accessibilityLiveRegion="polite" style={styles.request}>{requestLine}</Text>}

      {notice && <EmptyState alert text={notice} />}

      {model.account.history && <Section label="tu cubo">
        {runs === null ? <EmptyState text="…" /> : completed.length === 0 ? <EmptyState text="Aún no has completado ningún Run." /> :
          <View style={styles.cube}><CubeView runs={completed} size={Math.min(width - space.m * 2, 420)} /></View>}
        {runs !== null && runs.length > 0 && <ActionRow label="Runs" value={String(runs.length)}
          detail={`último ${new Date(runs[0].startedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`} />}
      </Section>}

      {model.cubes && <Section label="cubos">
        <ActionRow label="Mis cubos" value="→" detail="Crea cubos con tus fases, filas y columnas" onPress={() => router.push('/cubes')} />
      </Section>}

      {(model.account.export || model.system.visible) && <Section label="datos">
        {model.account.export && <ActionRow label="Exportar mis datos" detail="Perfil y Runs en un archivo .json"
          busy={busy === 'export'} onPress={() => void exportData()} />}
        {model.system.visible && <ActionRow label="Sistema" value="→" onPress={() => router.push('/system')} />}
      </Section>}

      <Section label="contacto">
        <ActionRow label="Teléfono de Scenarys" detail={copied ? 'Copiado' : 'Toca para copiarlo'} value={CONTACT_PHONE.label}
          onPress={copyPhone} accessibilityHint="Copia el número al portapapeles" />
      </Section>

      <Section label="sesión">
        <ActionRow label="Cerrar sesión" onPress={() => void controller.signOut()} />
        {model.account.delete && (password === null
          ? <ActionRow label="Borrar mi cuenta" tone="danger" detail="Elimina cuenta, perfil y Runs. No se puede deshacer."
              onPress={() => setPassword('')} />
          : <View style={styles.confirmDelete}>
              <Text style={styles.deleteText}>Escribe tu contraseña para borrar la cuenta.</Text>
              <TextInput {...inputChrome} value={password} onChangeText={setPassword} secureTextEntry autoFocus autoComplete="current-password"
                accessibilityLabel="Contraseña" onSubmitEditing={() => void deleteAccount()} style={styles.password} />
              <ActionRow label="Borrar definitivamente" tone="danger" busy={busy === 'delete'} onPress={() => void deleteAccount()} />
              <ActionRow label="Cancelar" onPress={() => setPassword(null)} />
            </View>)}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cube: { backgroundColor: color.night, marginHorizontal: -space.m, paddingVertical: space.m, alignItems: 'center', marginBottom: space.s },
  request: { fontSize: 13, lineHeight: 19, color: color.muted, fontFamily: font.text, paddingVertical: space.s, marginBottom: space.m, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  confirmDelete: { paddingTop: space.s },
  deleteText: { fontSize: 13, color: color.danger, fontFamily: font.text },
  password: { borderBottomWidth: 1, borderBottomColor: color.ink, fontSize: 16, paddingVertical: space.s, marginVertical: space.s, fontFamily: font.text, outlineStyle: 'none' } as object,
});
