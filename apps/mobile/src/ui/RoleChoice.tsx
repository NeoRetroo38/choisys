import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font, space, tap } from './theme';

export interface RoleOption { value: string; label: string; meaning?: string }

interface RoleChoiceProps {
  options: RoleOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Account type at sign-up: one tap chooses, nothing to confirm. The ring never fills; a small dot pops in,
 * and the meaning of the chosen type fades in under it. Display only: the server decides the real role.
 */
export default function RoleChoice({ options, value, onChange, disabled }: RoleChoiceProps) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Tipo de cuenta" style={styles.group}>
      {options.map(option => <Choice key={option.value} option={option} selected={option.value === value}
        disabled={disabled} onPress={() => onChange(option.value)} />)}
    </View>
  );
}

function Choice({ option, selected, disabled, onPress }: { option: RoleOption; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const progress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(progress, { toValue: selected ? 1 : 0, useNativeDriver: true, speed: 22, bounciness: 9 }).start();
  }, [progress, selected]);

  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={option.label} accessibilityHint={option.meaning}
      accessibilityState={{ selected, disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.ring, selected && styles.ringOn]}>
        <Animated.View style={[styles.dot, { opacity: progress, transform: [{ scale: progress }] }]} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.label, !selected && styles.labelOff]}>{option.label}</Text>
        {selected && option.meaning && <Animated.Text style={[styles.meaning, { opacity: progress }]}>{option.meaning}</Animated.Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.xs },
  row: { minHeight: tap, flexDirection: 'row', alignItems: 'flex-start', gap: space.s, paddingVertical: space.s - 2 },
  ring: { width: 18, height: 18, marginTop: 1, borderRadius: 9, borderWidth: 1, borderColor: color.faint, alignItems: 'center', justifyContent: 'center' },
  ringOn: { borderColor: color.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.ink },
  text: { flex: 1 },
  label: { fontFamily: font.mono, fontSize: 13, lineHeight: 20, color: color.ink, letterSpacing: 0.5 },
  labelOff: { color: color.muted },
  meaning: { fontFamily: font.text, fontSize: 12, lineHeight: 18, color: color.muted, marginTop: 2 },
  pressed: { opacity: 0.55 },
});
