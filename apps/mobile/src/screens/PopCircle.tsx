import { useEffect, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet } from 'react-native';

interface PopCircleProps {
  size: number;
  /** Stagger for the entrance pop, in ms. */
  delay: number;
  selected: boolean;
  disabled: boolean;
  label: string;
  onPress: () => void;
}

const native = Platform.OS !== 'web';

/** Phase button: springs in on mount and pops on press. One tap selects and sends. */
export default function PopCircle({ size, delay, selected, disabled, label, onPress }: PopCircleProps) {
  const [entrance] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(entrance, { toValue: 1, friction: 5, tension: 150, useNativeDriver: native }),
    ]).start();
  }, [delay, entrance]);

  // Expand on tap, then settle slightly larger to mark the choice. No fill change.
  function pop() {
    Animated.sequence([
      Animated.spring(press, { toValue: 1.32, friction: 4, tension: 260, useNativeDriver: native }),
      Animated.spring(press, { toValue: 1.14, friction: 6, tension: 140, useNativeDriver: native }),
    ]).start();
    onPress();
  }

  return (
    <Animated.View style={{ opacity: entrance, transform: [{ scale: Animated.multiply(entrance, press) }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label}
        accessibilityHint="Toca para elegir este círculo y pasar a la siguiente fase."
        accessibilityState={{ selected, disabled }} disabled={disabled} onPress={pop}
        style={[styles.circle, { width: size, height: size }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  circle: { borderRadius: 999, backgroundColor: '#000000' },
});
