import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const sources = {
  tap: require('../assets/sounds/tap.wav'),
  phase: require('../assets/sounds/phase.wav'),
  complete: require('../assets/sounds/complete.wav'),
  cube: require('../assets/sounds/cube.wav'),
  error: require('../assets/sounds/error.wav'),
} as const;

export type SoundName = keyof typeof sources;

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let configured = false;

/** Plays a UI sound. Never throws: audio problems must not interrupt the experience. */
export function playSound(name: SoundName): void {
  try {
    if (!configured) {
      configured = true;
      // Respect the silent switch and mix with the user's own audio.
      void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
    }
    const player = players[name] ?? (players[name] = createAudioPlayer(sources[name]));
    player.volume = 0.7;
    void player.seekTo(0);
    player.play();
  } catch {
    // Ignored on purpose.
  }
}
