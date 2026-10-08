import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AdminProfileRow, Role } from '@scenarys/shared';
import { roleLabel, roleOrder } from '../account/capabilities';
import ActionRow from './ActionRow';
import RoleBadge from './RoleBadge';
import { color, font, space, tap } from './theme';

interface ProfileControlsProps {
  person: AdminProfileRow;
  /** Present only with role.assign. The server decides which changes are valid (docs/ROLES.md). */
  onAssignRole?: (role: Role) => Promise<void>;
  /** Present only with account.disable. */
  onSetDisabled?: (disabled: boolean) => Promise<void>;
}

/** A person's row. Tap to open its actions in place; nothing opens without a capability to act. */
export default function ProfileControls({ person, onAssignRole, onSetDisabled }: ProfileControlsProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionable = !!(onAssignRole || onSetDisabled);
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } finally { setBusy(false); } };

  return (
    <View>
      <ActionRow label={person.displayName} busy={busy}
        detail={`${person.runCount} Runs${person.disabled ? ' · desactivada' : ''}`}
        value={<RoleBadge role={person.role} />}
        onPress={actionable ? () => setOpen(!open) : undefined}
        accessibilityHint={actionable ? 'Muestra las acciones sobre este perfil' : undefined} />
      {open && <View style={styles.panel}>
        {onAssignRole && <View style={styles.roles} accessibilityLabel="Cambiar rol">
          {roleOrder.filter(role => role !== person.role).map(role => (
            <Pressable key={role} accessibilityRole="button" accessibilityLabel={`Cambiar a ${roleLabel[role]}`} disabled={busy}
              onPress={() => void run(() => onAssignRole(role))} style={({ pressed }) => [styles.role, pressed && styles.pressed]}>
              <Text style={styles.roleText}>{roleLabel[role]}</Text>
            </Pressable>
          ))}
        </View>}
        {onSetDisabled && <ActionRow label={person.disabled ? 'Reactivar cuenta' : 'Desactivar cuenta'}
          tone={person.disabled ? 'default' : 'danger'} onPress={() => void run(() => onSetDisabled(!person.disabled))} />}
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingVertical: space.s },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  role: { minHeight: tap - 8, paddingHorizontal: space.s, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: color.ink, borderRadius: 999 },
  roleText: { fontFamily: font.mono, fontSize: 12, color: color.ink },
  pressed: { opacity: 0.55 },
});
