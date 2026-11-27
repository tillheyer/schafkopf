/**
 * Kleines vorwärts gerichtetes Netz (2 verdeckte Schichten) für MEGA.
 * Gewichte liegen als int8 mit Maßstab je Zeile vor (siehe training/train.py).
 */
export interface LayerJson {
  name: string;
  out: number;
  in: number;
  w: string;
  scale: string;
  b: string;
}
export interface NetJson {
  features: number;
  layers: LayerJson[];
}

interface Layer {
  out: number;
  in: number;
  w: Float32Array;
  b: Float32Array;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

/** base64 → Bytes (ohne atob, damit es auch in React Native sicher läuft). */
export function decodeBase64(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

const floats = (s: string) => {
  const bytes = decodeBase64(s);
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
};

function toLayer(l: LayerJson): Layer {
  const q = decodeBase64(l.w);
  const scale = floats(l.scale);
  const w = new Float32Array(l.out * l.in);
  for (let r = 0; r < l.out; r++) {
    const sc = scale[r];
    for (let k = 0; k < l.in; k++) {
      const v = q[r * l.in + k];
      w[r * l.in + k] = (v > 127 ? v - 256 : v) * sc;
    }
  }
  return { out: l.out, in: l.in, w, b: floats(l.b).slice() };
}

function dense(l: Layer, x: Float32Array, relu: boolean): Float32Array {
  const y = new Float32Array(l.out);
  // Eingaben sind oft 0 (dünn besetzt): nur die von 0 verschiedenen aufsummieren.
  const nz: number[] = [];
  for (let k = 0; k < l.in; k++) if (x[k] !== 0) nz.push(k);
  for (let r = 0; r < l.out; r++) {
    let s = l.b[r];
    const base = r * l.in;
    for (let j = 0; j < nz.length; j++) s += l.w[base + nz[j]] * x[nz[j]];
    y[r] = relu && s < 0 ? 0 : s;
  }
  return y;
}

export interface NetOutput {
  /** Geschätzter Wert jeder Karte (in Einheiten des Spieleinsatzes). */
  q: Float32Array;
  /** Bewertung, welche Karte der starke Computer spielen würde (Logits). */
  policy: Float32Array;
  /** Erwartetes Ergebnis aus dieser Lage (in Einheiten des Spieleinsatzes). */
  value: number;
}

export class MegaNet {
  private l1: Layer;
  private l2: Layer;
  private q: Layer;
  private pi: Layer;
  private v: Layer;
  readonly features: number;
  constructor(json: NetJson) {
    const by = Object.fromEntries(json.layers.map((l) => [l.name, toLayer(l)]));
    this.l1 = by.l1;
    this.l2 = by.l2;
    this.q = by.q;
    this.pi = by.pi;
    this.v = by.v;
    this.features = json.features;
  }
  run(x: Float32Array): NetOutput {
    const h = dense(this.l2, dense(this.l1, x, true), true);
    return { q: dense(this.q, h, false), policy: dense(this.pi, h, false), value: dense(this.v, h, false)[0] };
  }
}
