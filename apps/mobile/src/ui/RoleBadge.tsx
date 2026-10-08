import { StyleSheet, Text } from 'react-native';
import { roleLabel } from '../account/capabilities';
import { color, font } from './theme';

/** The role's human name, in technical type. Display only: it never decides what is shown. */
export default function RoleBadge({ role }: { role: string }) {
  return <Text accessibilityLabel={`Rol ${roleLabel[role] ?? role}`} style={styles.badge}>{roleLabel[role] ?? role.toLowerCase()}</Text>;
}

const styles = StyleSheet.create({
  badge: { fontFamily: font.mono, fontSize: 11, letterSpacing: 1, color: color.muted },
});
