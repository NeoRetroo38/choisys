import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RoleRequestRow as Row } from '../account/accountApi';
import type { Role } from '@scenarys/shared';
import { roleLabel } from '../account/capabilities';
import { isLowerRole } from '../account/rolePresentation';
import ActionRow from './ActionRow';
import { color, font, space, tap } from './theme';

/** A pending request. Deciding is one tap on either word; present only with role.assign. */
export default function RoleRequestRow({ request, actorRole, onDecide }: { request: Row; actorRole?: Role; onDecide?: (approve: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const canDecide = !!onDecide && request.status === 'PENDING' && isLowerRole(actorRole, request.profile.role);
  const canApprove = canDecide && isLowerRole(actorRole, request.requestedRole);
  const decide = async (approve: boolean) => { if (!onDecide) return; setBusy(true); try { await onDecide(approve); } finally { setBusy(false); } };
  const when = new Date(request.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return (
    <View>
      <ActionRow label={request.profile.displayName} busy={busy}
        detail={`${roleLabel[request.profile.role] ?? request.profile.role} → ${roleLabel[request.requestedRole]} · ${when}`} />
      {canDecide && !canApprove && <Text style={styles.hint}>Este rol no se puede aprobar desde una cuenta de igual o menor nivel.</Text>}
      {canDecide && !busy && <View style={styles.actions}>
        {canApprove &&
        <Pressable accessibilityRole="button" accessibilityLabel={`Aprobar ${roleLabel[request.requestedRole]} para ${request.profile.displayName}`}
          onPress={() => void decide(true)} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.text}>aprobar</Text>
        </Pressable>}
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
  hint: { fontFamily: font.text, fontSize: 12, lineHeight: 18, color: color.muted },
  pressed: { opacity: 0.55 },
});
