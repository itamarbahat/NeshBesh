/**
 * generate-sfx.ts — placeholder SFX generator for the dice polish PRD.
 *
 * Emits three minimal, royalty-free WAV files into `assets/sfx/`:
 *   • dice-shake-loop.wav   ~200ms band-passed white noise (loop-safe)
 *   • dice-land.wav         ~250ms low-frequency thud with quick decay
 *   • checker-click.wav     ~80ms sharp tick (high-frequency transient)
 *
 * All synthesis is done with hand-written PCM (no external deps).
 * Idempotent: running again overwrites the same paths.
 *
 * Usage:
 *   npx ts-node scripts/generate-sfx.ts
 *   (or: `npm run sfx:generate` once the script is wired in package.json)
 */
import * as fs from 'fs';
import * as path from 'path';

const SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const TWO_PI = Math.PI * 2;

function writeWavMono(samples: Float32Array, outPath: string) {
  const dataBytes = samples.length * (BITS_PER_SAMPLE / 8);
  const buf = Buffer.alloc(44 + dataBytes);
  // RIFF header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  // fmt subchunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(NUM_CHANNELS, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  buf.writeUInt16LE(NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  buf.writeUInt16LE(BITS_PER_SAMPLE, 34);
  // data subchunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

// ── Filters ─────────────────────────────────────────────────────────────────
function biquadBandpass(input: Float32Array, centerHz: number, q: number): Float32Array {
  const w0 = TWO_PI * centerHz / SAMPLE_RATE;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * q);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x0 = input[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    out[i] = y0;
    x2 = x1; x1 = x0;
    y2 = y1; y1 = y0;
  }
  return out;
}

// ── Generators ──────────────────────────────────────────────────────────────
function makeShakeLoop(): Float32Array {
  // 200ms loop-safe rattle: filtered white noise with a small crossfade at
  // both ends so it can be looped seamlessly.
  const length = Math.floor(SAMPLE_RATE * 0.2);
  const noise = new Float32Array(length);
  for (let i = 0; i < length; i++) noise[i] = (Math.random() * 2 - 1) * 0.9;
  // Band-pass around 2.5kHz to give the rattling pebble texture.
  const filtered = biquadBandpass(noise, 2500, 2.0);
  // Crossfade the last 5ms with the first 5ms for loop safety.
  const xfade = Math.floor(SAMPLE_RATE * 0.005);
  for (let i = 0; i < xfade; i++) {
    const t = i / xfade;
    filtered[i] = filtered[i] * t + filtered[length - xfade + i] * (1 - t);
  }
  // Trim the tail that was used for crossfade source.
  const out = filtered.subarray(0, length - xfade);
  // Normalize to ~0.6.
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = 0.6 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
  return new Float32Array(out);
}

function makeLandThud(): Float32Array {
  // 250ms percussive thud: low sine burst (~80Hz) with a sharp attack and
  // exponential decay, plus a faint noise click for body.
  const length = Math.floor(SAMPLE_RATE * 0.25);
  const out = new Float32Array(length);
  const f = 80;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 18);
    const tone = Math.sin(TWO_PI * f * t) * env;
    const click = (Math.random() * 2 - 1) * Math.exp(-t * 80) * 0.3;
    out[i] = tone * 0.85 + click;
  }
  // Soft attack curve.
  const attack = Math.floor(SAMPLE_RATE * 0.005);
  for (let i = 0; i < attack; i++) out[i] *= i / attack;
  return out;
}

function makeCheckerClick(): Float32Array {
  // 80ms sharp tick: short high-frequency transient + fast decay.
  const length = Math.floor(SAMPLE_RATE * 0.08);
  const out = new Float32Array(length);
  const f = 1800;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 60);
    const tone = Math.sin(TWO_PI * f * t) * env;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 200) * 0.4;
    out[i] = tone * 0.6 + noise;
  }
  return out;
}

// ── Run ─────────────────────────────────────────────────────────────────────
const outDir = path.resolve(__dirname, '..', 'assets', 'sfx');
const targets = [
  { file: 'dice-shake-loop.wav', samples: makeShakeLoop() },
  { file: 'dice-land.wav',       samples: makeLandThud() },
  { file: 'checker-click.wav',   samples: makeCheckerClick() },
];
for (const t of targets) {
  const p = path.join(outDir, t.file);
  writeWavMono(t.samples, p);
  // eslint-disable-next-line no-console
  console.log(`wrote ${p} (${t.samples.length} samples)`);
}
