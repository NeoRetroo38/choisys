import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface WelcomeScreenProps { onContinue: () => void }

export default function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const logoSize = Math.min(width - 56, 430, height * 0.56);
  return <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
    <View style={styles.identity}>
      <Image source={require('../../assets/scenarys-logo.jpg')} resizeMode="contain"
        accessibilityLabel="Scenarys" style={{ width: logoSize, height: logoSize }} />
      <Text style={styles.tagline}>Every choisys is a fresh start</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Continuar"
      onPress={onContinue} style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}>
      <Text style={styles.continueText}>Continuar</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  identity: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  tagline: { color: '#ffffff', fontSize: 18, lineHeight: 26, letterSpacing: 0.3, textAlign: 'center', marginTop: -40 },
  continueButton: {
    width: '100%', maxWidth: 430, minHeight: 54, borderRadius: 30,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  continueText: { color: '#000000', fontSize: 16, lineHeight: 22, fontWeight: '500' },
  pressed: { opacity: 0.72 },
});
