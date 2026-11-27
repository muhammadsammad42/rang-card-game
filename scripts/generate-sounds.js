/**
 * generate-sounds.js — synthesises the app's short sound effects as WAV files
 * into assets/sounds/. Run with:  node scripts/generate-sounds.js
 *
 * Everything is built from sine tones (chimes, bells, blips) and short
 * filtered noise bursts (card flicks), with smooth attack/decay envelopes and
 * a fade-out so nothing clicks. Mono, 22.05 kHz, 16-bit, peak-normalised
 * quietly. Tweak a recipe below and re-run to change a sound.
 */
const fs = require('fs');
const path = require('path');

const RATE = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'sounds');

// ---- building blocks -------------------------------------------------------

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

/** Adds a sine tone (with optional 2nd harmonic for a bell-like colour) starting at `at` seconds. */
function tone(buf, { at = 0, freq, to = freq, dur, gain = 1, attack = 0.005, decay = 6, harmonic = 0 }) {
  const start = Math.floor(at * RATE);
  const n = Math.floor(dur * RATE);
  let phase = 0;
  let phase2 = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / RATE;
    const f = freq + (to - freq) * (i / n);
    phase += (2 * Math.PI * f) / RATE;
    phase2 += (2 * Math.PI * f * 2) / RATE;
    const env = Math.min(1, t / attack) * Math.exp(-decay * t);
    buf[start + i] += gain * env * (Math.sin(phase) + harmonic * Math.sin(phase2));
  }
}

/** A short band-limited noise burst — the "flick" of a card. */
function flick(buf, { at = 0, dur = 0.09, gain = 1, low = 0.25, high = 0.04, decay = 40, seed = 1 }) {
  const start = Math.floor(at * RATE);
  const n = Math.floor(dur * RATE);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  let lp = 0;
  let lp2 = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    const t = i / RATE;
    lp += low * (rand() - lp); // low-pass
    lp2 += high * (lp - lp2); // its low part, subtracted below → band-pass
    const env = Math.min(1, t / 0.003) * Math.exp(-decay * t);
    buf[start + i] += gain * env * (lp - lp2);
  }
}

/** Normalises to `peak` and fades the last 15 ms so the file ends silently. */
function finish(buf, peak) {
  let max = 0;
  for (const v of buf) max = Math.max(max, Math.abs(v));
  const k = max > 0 ? peak / max : 0;
  const fade = Math.floor(0.015 * RATE);
  for (let i = 0; i < buf.length; i++) {
    const tail = buf.length - i;
    buf[i] *= k * (tail < fade ? tail / fade : 1);
  }
  return buf;
}

function writeWav(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.concat([head, data]));
}

// ---- recipes ---------------------------------------------------------------

const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568;

const recipes = {
  // Crisp modern UI click: high transient + short tonal body.
  tap: () => {
    const b = buffer(0.045);
    flick(b, { dur: 0.015, low: 0.7, high: 0.25, decay: 320, seed: 9 });
    tone(b, { freq: 2300, to: 1900, dur: 0.03, decay: 160, attack: 0.0004, gain: 0.6 });
    tone(b, { freq: 1150, dur: 0.045, decay: 110, attack: 0.0006, gain: 0.5 });
    return finish(b, 0.6);
  },
  // Card lifted: a tiny rising blip.
  select: () => {
    const b = buffer(0.07);
    tone(b, { freq: 900, to: 1400, dur: 0.07, decay: 55, attack: 0.002 });
    return finish(b, 0.3);
  },
  // Card thrown on the table: noise flick + soft thump.
  play: () => {
    const b = buffer(0.14);
    flick(b, { dur: 0.12, decay: 32, seed: 3 });
    tone(b, { at: 0.01, freq: 190, to: 120, dur: 0.08, gain: 0.6, decay: 45 });
    return finish(b, 0.5);
  },
  // Soft "nope": two gentle descending tones.
  invalid: () => {
    const b = buffer(0.26);
    tone(b, { freq: 392, dur: 0.12, decay: 18, attack: 0.008, harmonic: 0.15 });
    tone(b, { at: 0.1, freq: 311, dur: 0.16, decay: 16, attack: 0.008, harmonic: 0.15 });
    return finish(b, 0.32);
  },
  // Trick won: a two-note bell.
  trick: () => {
    const b = buffer(0.42);
    tone(b, { freq: G5, dur: 0.4, decay: 9, harmonic: 0.25 });
    tone(b, { at: 0.07, freq: C6, dur: 0.35, decay: 9, harmonic: 0.25 });
    return finish(b, 0.38);
  },
  // Middle pile collected: quick rising arpeggio.
  pile: () => {
    const b = buffer(0.65);
    [C5, E5, G5, C6, E6].forEach((f, i) => tone(b, { at: i * 0.06, freq: f, dur: 0.4, decay: 8, harmonic: 0.2, gain: 0.8 }));
    flick(b, { at: 0.0, dur: 0.1, gain: 0.5, decay: 30, seed: 11 });
    return finish(b, 0.42);
  },
  // Rang reveal: low swell, then a bright shimmer.
  reveal: () => {
    const b = buffer(0.95);
    tone(b, { freq: 98, dur: 0.9, attack: 0.25, decay: 2.5, gain: 1, harmonic: 0.4 });
    tone(b, { freq: 147, dur: 0.9, attack: 0.25, decay: 2.5, gain: 0.6 });
    tone(b, { at: 0.3, freq: C6, dur: 0.6, decay: 5, gain: 0.45, harmonic: 0.3 });
    tone(b, { at: 0.36, freq: G6, dur: 0.55, decay: 6, gain: 0.3 });
    return finish(b, 0.5);
  },
  // Bid placed: woody tick.
  bid: () => {
    const b = buffer(0.12);
    tone(b, { freq: 660, dur: 0.12, decay: 40, attack: 0.001 });
    tone(b, { freq: 990, dur: 0.08, decay: 55, gain: 0.5, attack: 0.001 });
    return finish(b, 0.34);
  },
  // Your turn: a subtle, high, quiet chime.
  turn: () => {
    const b = buffer(0.45);
    tone(b, { freq: E6, dur: 0.45, decay: 8, attack: 0.01, gain: 0.7 });
    tone(b, { at: 0.08, freq: G6, dur: 0.37, decay: 9, attack: 0.01, gain: 0.5 });
    return finish(b, 0.22);
  },
  // Hand won: major arpeggio + sparkle.
  win: () => {
    const b = buffer(1.0);
    [C5, E5, G5, C6].forEach((f, i) => tone(b, { at: i * 0.1, freq: f, dur: 0.7, decay: 4.5, harmonic: 0.25 }));
    tone(b, { at: 0.42, freq: E6, dur: 0.55, decay: 6, gain: 0.4 });
    tone(b, { at: 0.5, freq: G6, dur: 0.5, decay: 7, gain: 0.3 });
    return finish(b, 0.45);
  },
  // Hand lost: gentle descending minor notes.
  lose: () => {
    const b = buffer(0.85);
    [440, 349.23, 293.66].forEach((f, i) => tone(b, { at: i * 0.18, freq: f, dur: 0.45, decay: 6, attack: 0.012, harmonic: 0.15 }));
    return finish(b, 0.34);
  },
  // Reaction sent: soft pop.
  pop: () => {
    const b = buffer(0.09);
    tone(b, { freq: 380, to: 950, dur: 0.09, decay: 45, attack: 0.002 });
    return finish(b, 0.32);
  },
  // Dealing: a run of quick card flicks.
  deal: () => {
    const b = buffer(0.62);
    for (let i = 0; i < 6; i++) flick(b, { at: i * 0.095, dur: 0.07, decay: 45, gain: 0.8 + (i % 2) * 0.2, seed: 21 + i });
    return finish(b, 0.4);
  },
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, make] of Object.entries(recipes)) writeWav(name, make());
console.log(`Wrote ${Object.keys(recipes).length} sounds to ${path.relative(process.cwd(), OUT)}`);
