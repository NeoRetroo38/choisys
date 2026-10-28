import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { accentNames, accents, emojiChoices, phaseLabel, type Accent } from '../cube/cubePrefs';
import { useCubePrefs } from '../cube/useCubePrefs';
import CubeView from '../screens/CubeView';
import Screen from '../ui/Screen';
import Section from '../ui/Section';
import { color, font, space, tap } from '../ui/theme';

// Example run so the preview shows the user's style on a real-looking path.
const sample = [[{ phase: 1, row: 1, column: 2 }, { phase: 2, row: 2, column: 2 }, { phase: 3, row: 3, column: 1 }]];
const phases = [1, 2, 3];

/** Personal look of the cube: accent colour and an emoji per phase. Saved on this device. */
export default function CubeStyle() {
  const [prefs, update] = useCubePrefs();
  const [editing, setEditing] = useState<number | null>(null);
  const back = () => router.canGoBack() ? router.back() : router.replace('/account');
  const setEmoji = (phase: number, emoji: string) => {
    const next = [...prefs.phaseEmojis];
    while (next.length < phase) next.push('');
    next[phase - 1] = emoji;
    update({ phaseEmojis: next });
    setEditing(null);
  };
  return (
    <Screen title="estilo del cubo" onBack={back}>
      <View style={styles.preview}><CubeView runs={sample} size={300} caption="vista previa" /></View>
      <Section label="color">
        <View style={styles.row}>
          {(Object.keys(accents) as Accent[]).map(accent => {
            const selected = prefs.accent === accent;
            return <Pressable key={accent} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={accentNames[accent]}
              onPress={() => update({ accent })} style={[styles.swatch, selected && styles.swatchSelected]}>
              <View style={[styles.swatchFill, { backgroundColor: accents[accent] }]} />
            </Pressable>;
          })}
        </View>
        <Text style={styles.note}>{accentNames[prefs.accent]}</Text>
      </Section>
      <Section label="fases">
        {phases.map(phase => <View key={phase}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Fase ${phase}: ${phaseLabel(prefs, phase)}. Cambiar`}
            onPress={() => setEditing(editing === phase ? null : phase)} style={styles.phaseRow}>
            <Text style={styles.phaseName}>fase {phase}</Text>
            <Text style={styles.phaseValue}>{phaseLabel(prefs, phase)}</Text>
          </Pressable>
          {editing === phase && <View style={styles.emojis}>
            {emojiChoices.map(emoji => <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={emoji}
              onPress={() => setEmoji(phase, emoji)} style={styles.emoji}><Text style={styles.emojiText}>{emoji}</Text></Pressable>)}
            <Pressable accessibilityRole="button" onPress={() => setEmoji(phase, '')} style={styles.reset}>
              <Text style={styles.note}>sin emoji (f{phase})</Text>
            </Pressable>
          </View>}
        </View>)}
      </Section>
      <Text style={styles.note}>Solo cambia cómo se ve tu cubo en este dispositivo. Tus datos no cambian.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  preview: { backgroundColor: color.night, borderRadius: 16, paddingVertical: space.m, alignItems: 'center', marginBottom: space.l },
  row: { flexDirection: 'row', gap: space.s, flexWrap: 'wrap' },
  swatch: { width: tap, height: tap, borderRadius: 999, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderColor: color.ink, borderWidth: 2 },
  swatchFill: { width: 30, height: 30, borderRadius: 999, borderWidth: 1, borderColor: color.ink },
  note: { fontSize: 12, color: color.muted, fontFamily: font.mono, marginTop: space.xs },
  phaseRow: { minHeight: tap, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: color.line },
  phaseName: { fontSize: 16, color: color.ink, fontFamily: font.text },
  phaseValue: { fontSize: 20, color: color.ink, fontFamily: font.mono },
  emojis: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingVertical: space.s },
  emoji: { width: tap, height: tap, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: color.paper },
  emojiText: { fontSize: 24 },
  reset: { width: '100%', paddingVertical: space.xs },
});
