import { useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { font } from './theme';

/** Ten little bars: tap or drag to choose how many recent runs the cube draws. */
export default function RunsBar({ value, max, available, accent, onChange }: {
  value: number; max: number; available: number; accent: string; onChange: (value: number) => void;
}) {
  const [bar] = useState(() => ({ width: 0, onChange }));
  bar.onChange = onChange;
  const pick = (x: number) => { if (bar.width > 0) bar.onChange(Math.max(1, Math.min(max, Math.ceil((x / bar.width) * max)))); };
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => pick(event.nativeEvent.locationX),
    onPanResponderMove: event => pick(event.nativeEvent.locationX),
  }));
  const shown = Math.min(value, available);
  return (
    <View style={styles.wrap}>
      <View onLayout={(event: LayoutChangeEvent) => { bar.width = event.nativeEvent.layout.width; }} {...pan.panHandlers}
        accessible accessibilityRole="adjustable" accessibilityLabel="Runs que se ven en el cubo"
        accessibilityValue={{ min: 1, max, now: value }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => onChange(Math.max(1, Math.min(max, value + (event.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        style={styles.bars}>
        {Array.from({ length: max }, (_, index) => <View key={index} pointerEvents="none"
          style={[styles.bar, { height: 10 + index * 2.6 }, index < value && { backgroundColor: index === value - 1 ? accent : '#ffffff' },
            index >= available && styles.empty]} />)}
      </View>
      <Text style={[styles.label, { color: accent }]}>{shown === 1 ? 'último run' : `últimos ${shown} runs`}{value > available ? ` · tienes ${available}` : ''}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, paddingBottom: 14 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 40, paddingHorizontal: 8 },
  bar: { width: 14, borderRadius: 4, backgroundColor: '#3a3a3a' },
  empty: { opacity: 0.35 },
  label: { fontFamily: font.mono, fontSize: 12 },
});
