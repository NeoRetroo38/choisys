import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import RoleBadge from './RoleBadge';
import { color, font, space } from './theme';

interface ProfileHeaderProps {
  name: string;
  role: string;
  since: string;
  /** Present only when the API grants renaming. Resolves when saved. */
  onRename?: (name: string) => Promise<void>;
}

/** Name large and light; tap it to edit in place when allowed. No separate settings screen. */
export default function ProfileHeader({ name, role, since, onRename }: ProfileHeaderProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const next = draft?.trim();
    if (!onRename || !next || next === name) { setDraft(null); return; }
    setSaving(true);
    try { await onRename(next); setDraft(null); } finally { setSaving(false); }
  };
  return (
    <View style={styles.header}>
      {draft === null ? (
        <Pressable disabled={!onRename} onPress={() => setDraft(name)} accessibilityRole={onRename ? 'button' : 'text'}
          accessibilityHint={onRename ? 'Toca para cambiar tu nombre' : undefined}>
          <Text style={styles.name}>{name}</Text>
        </Pressable>
      ) : (
        <TextInput value={draft} onChangeText={setDraft} autoFocus editable={!saving} maxLength={120}
          onSubmitEditing={() => void save()} onBlur={() => void save()} returnKeyType="done"
          accessibilityLabel="Tu nombre" style={[styles.name, styles.input]} />
      )}
      <View style={styles.meta}>
        <RoleBadge role={role} />
        <Text style={styles.since}>desde {new Date(since).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: space.xl },
  name: { fontSize: 40, lineHeight: 46, color: color.ink, fontFamily: font.text, fontWeight: '300', letterSpacing: -1.2 },
  input: { padding: 0, borderBottomWidth: 1, borderBottomColor: color.ink, outlineStyle: 'none' } as object,
  meta: { flexDirection: 'row', gap: space.s, alignItems: 'center', marginTop: space.s },
  since: { fontSize: 12, color: color.faint, fontFamily: font.text },
});
