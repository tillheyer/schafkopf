/**
 * Spielgeräusche, direkt im Browser erzeugt (Web Audio), also ohne fremde
 * Sounddateien und ohne Lizenzfragen. Auf anderen Plattformen bleibt es still.
 */

export type SoundName = 'card' | 'collect' | 'deal' | 'bid' | 'pass' | 'kontra' | 're' | 'win' | 'lose';

let enabled = true;
let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) audio(); // im Klick-Handler erzeugen, damit der Browser Ton erlaubt
}

export function soundEnabled() {
  return enabled;
}

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC() as AudioContext;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Browser erlauben Ton erst nach einer Berührung: beim ersten Tippen freischalten.
try {
  const w = globalThis as any;
  if (w.addEventListener) {
    const unlock = () => {
      if (enabled) audio();
      w.removeEventListener('pointerdown', unlock);
      w.removeEventListener('keydown', unlock);
    };
    w.addEventListener('pointerdown', unlock);
    w.addEventListener('keydown', unlock);
  }
} catch {
  /* kein Browser */
}

function noise(a: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Gefiltertes Rauschen mit kurzer Hüllkurve (Karte, Wischen). */
function burst(a: AudioContext, out: AudioNode, t: number, dur: number, vol: number, f0: number, f1 = f0, q = 1.2) {
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, t);
  bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** Kurzer Ton mit weichem Ausklang. */
function tone(a: AudioContext, out: AudioNode, t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'triangle', toFreq?: number) {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Karte klatscht auf den Tisch. */
function cardSnap(a: AudioContext, out: AudioNode, t: number, vol = 1) {
  burst(a, out, t, 0.07, 0.5 * vol, 3200, 1400, 0.9);
  tone(a, out, t, 160, 0.06, 0.25 * vol, 'sine', 70);
}

/** Klopfen auf den Holztisch (Kontra, Re). */
function knock(a: AudioContext, out: AudioNode, t: number, pitch = 1) {
  tone(a, out, t, 210 * pitch, 0.12, 0.6, 'sine', 90 * pitch);
  burst(a, out, t, 0.03, 0.25, 1800 * pitch, 900 * pitch, 2);
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  (globalThis as any).__sfx?.push(name); // für Tests
  const a = audio();
  if (!a || a.state !== 'running') return;
  const out = a.createGain();
  out.gain.value = 0.55;
  out.connect(a.destination);
  const t = a.currentTime + 0.005;
  switch (name) {
    case 'card':
      cardSnap(a, out, t);
      break;
    case 'collect':
      burst(a, out, t, 0.26, 0.28, 700, 2600, 0.8);
      break;
    case 'deal':
      for (let i = 0; i < 8; i++) cardSnap(a, out, t + i * 0.085 + Math.random() * 0.02, 0.45);
      break;
    case 'bid':
      tone(a, out, t, 587, 0.18, 0.18);
      tone(a, out, t + 0.09, 880, 0.26, 0.16);
      break;
    case 'pass':
      tone(a, out, t, 330, 0.12, 0.1, 'sine');
      break;
    case 'kontra':
      knock(a, out, t);
      knock(a, out, t + 0.16);
      break;
    case 're':
      knock(a, out, t, 1.2);
      knock(a, out, t + 0.13, 1.2);
      knock(a, out, t + 0.26, 1.2);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, out, t + i * 0.1, f, i === 3 ? 0.5 : 0.2, 0.2));
      break;
    case 'lose':
      tone(a, out, t, 392, 0.25, 0.18);
      tone(a, out, t + 0.2, 311, 0.45, 0.18);
      break;
  }
}
