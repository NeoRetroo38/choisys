import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RoleRequestRow as Row } from '../account/accountApi';
import { roleLabel } from '../account/capabilities';
import ActionRow from './ActionRow';
import { color, font, space, tap } from './theme';

/** A pending request. Deciding is one tap on either word; present only with role.assign. */
export default function RoleRequestRow({ request, onDecide }: { request: Row; onDecide?: (approve: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => { if (!onDecide) return; setBusy(true); try { await onDecide(approve); } finally { setBusy(false); } };
  const when = new Date(request.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return (
    <View>
      <ActionRow label={request.profile.displayName} busy={busy}
        detail={`${roleLabel[request.profile.role] ?? request.profile.role} → ${roleLabel[request.requestedRole]} · ${when}`} />
      {onDecide && !busy && <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Aprobar ${roleLabel[request.requestedRole]} para ${request.profile.displayName}`}
          onPress={() => void decide(true)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.text}>aprobar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Rechazar la solicitud de ${request.profile.displayName}`}
          onPress={() => void decide(false)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={[styles.text, styles.reject]}>rechazar</Text>
        </Pressable>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.xs, paddingVertical: space.s },
  action: { minHeight: tap - 8, paddingHorizontal: space.s, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: color.ink, borderRadius: 999 },
  text: { fontFamily: font.mono, fontSize: 12, color: color.ink },
  reject: { color: color.danger },
  pressed: { opacity: 0.55 },
});
