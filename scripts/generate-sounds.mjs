// Synthesizes the UI sound effects as small 16-bit mono WAV files (original audio, no third-party samples).
// Usage: node scripts/generate-sounds.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rate = 22050;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'mobile', 'assets', 'sounds');
mkdirSync(out, { recursive: true });

/** One sine voice with a frequency glide and an attack/decay envelope, mixed into `buffer` at `start` seconds. */
function voice(buffer, { start = 0, duration, from, to = from, gain = 0.5, attack = 0.006, curve = 3 }) {
  const first = Math.floor(start * rate);
  const length = Math.floor(duration * rate);
  let phase = 0;
  for (let i = 0; i < length && first + i < buffer.length; i += 1) {
    const t = i / length;
    phase += (2 * Math.PI * (from + (to - from) * t)) / rate;
    const envelope = Math.min(1, i / (attack * rate)) * Math.pow(1 - t, curve);
    buffer[first + i] += Math.sin(phase) * envelope * gain;
  }
}

function save(name, seconds, build) {
  const samples = new Float32Array(Math.floor(seconds * rate));
  build(samples);
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0); data.writeUInt32LE(36 + samples.length * 2, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((value, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + i * 2));
  writeFileSync(join(out, `${name}.wav`), data);
  console.log(`${name}.wav  ${(data.length / 1024).toFixed(1)} KB`);
}

// Tap on a circle: short rising pop.
save('tap', 0.2, b => { voice(b, { duration: 0.18, from: 480, to: 820, gain: 0.55, curve: 4 }); });
// Phase accepted: two soft rising notes.
save('phase', 0.5, b => {
  voice(b, { duration: 0.22, from: 659, gain: 0.4 });
  voice(b, { start: 0.12, duration: 0.34, from: 880, gain: 0.4 });
});
// Run complete: rising arpeggio.
save('complete', 0.9, b => {
  [523, 659, 784, 1047].forEach((hz, i) => voice(b, { start: i * 0.11, duration: i === 3 ? 0.5 : 0.28, from: hz, gain: 0.34 }));
});
// Cube opens: rising sweep with a quiet octave shimmer.
save('cube', 0.7, b => {
  voice(b, { duration: 0.65, from: 160, to: 640, gain: 0.35, attack: 0.08, curve: 1.6 });
  voice(b, { start: 0.05, duration: 0.6, from: 320, to: 1280, gain: 0.12, attack: 0.1, curve: 2 });
});
// Something went wrong: low falling blip.
save('error', 0.3, b => { voice(b, { duration: 0.26, from: 220, to: 130, gain: 0.5, curve: 2.5 }); });
