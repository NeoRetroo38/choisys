import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FadeIn from '../screens/FadeIn';
import { color, font, maxWidth, space, tap } from './theme';

interface ScreenProps {
  title: string;
  /** Back to the experience; the only way out, always in the same place. */
  onBack?: () => void;
  children: ReactNode;
}

/** One column, lots of air, a single quiet way back. Same frame on iPhone, Mac and web. */
export default function Screen({ title, onBack, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingTop: insets.top + space.m, paddingBottom: insets.bottom + space.xl }]}>
      <FadeIn>
        <View style={styles.top}>
          {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} hitSlop={12}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={styles.backText}>←</Text>
          </Pressable>}
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        </View>
        {children}
      </FadeIn>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.paper },
  content: { width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: space.m },
  top: { flexDirection: 'row', alignItems: 'center', minHeight: tap, marginBottom: space.l },
  back: { width: tap, height: tap, marginLeft: -space.s, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 22, color: color.ink, fontFamily: font.text, fontWeight: '300' },
  title: { fontSize: 30, color: color.ink, fontFamily: font.text, fontWeight: '300', letterSpacing: -0.8 },
  pressed: { opacity: 0.55 },
});
