import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';

interface FadeInProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
  /** Starting vertical offset in px; eases to 0. */
  offset?: number;
}

const native = Platform.OS !== 'web';

/** Screen transition: fade and rise on mount. Remount with a `key` to replay it. */
export default function FadeIn({ children, style, duration = 340, offset = 14 }: FadeInProps) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [duration, progress]);
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}
