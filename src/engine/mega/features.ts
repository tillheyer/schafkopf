import { CardId, fullDeck, pointsOf, Suit, sumPoints } from '../cards';
import { GameState, calledAcePlayed, sauGesucht } from '../game';
import { DEFAULT_TARIF } from '../scoring';
import { effectiveSuit, isSoloLike, isTout, trickWinnerIndex, trumpPower } from '../rules';
import { knownEnemies, knownTeammates } from '../ai';

/**
 * Eingabe für das neuronale Netz (MEGA): alles, was ein Spieler am Tisch wissen
 * kann – nie fremde Karten. Spieler werden relativ zum eigenen Platz gezählt
 * (0 = ich, 1 = links von mir …), damit das Netz für jeden Platz gleich lernt.
 */
export const CARDS: CardId[] = fullDeck();
export const CARD_INDEX: Record<string, number> = Object.fromEntries(CARDS.map((c, i) => [c, i]));
const KINDS = ['sauspiel', 'hochzeit', 'ramsch', 'bettel', 'wenz', 'geier', 'farbwenz', 'farbgeier', 'solo'];
const SUITS: Suit[] = ['E', 'G', 'H', 'S'];
const ESUITS = ['E', 'G', 'H', 'S', 'T'];

export const FEATURES =
  32 + // eigene Hand
  4 * 32 + // gespielte Karten je Spieler (frühere Stiche)
  3 * 32 + // Karten im laufenden Stich je Spieler (1..3)
  32 + // noch unbekannte Karten (weder gespielt noch auf meiner Hand)
  32 + // Trumpf-Maske
  32 + // Trumpf-Stärke
  32 + // Augen je Karte
  9 + 4 + 2 + // Spielart, Farbe, Tout/Brett
  4 + // Spieler (relativ)
  4 + 4 + // sichere Mitspieler / sichere Gegner
  4 + // Position im Stich
  4 + // wer liegt im Stich vorn
  1 + 1 + // Augen im Stich, Stichnummer
  4 + // Augen je Spieler
  3 * 5 + // bekannte Fehlfarben der anderen
  2 + // Kontra, Re
  2 + // Sau gesucht / gefallen
  1; // bin ich in der Spielerpartei (sicher)

/** Einsatz des Spiels in Cent (Grundtarif × Kontra × Re × Bock): Maßstab für die Werte des Netzes. */
export function stakeOf(s: GameState): number {
  const c = s.contract!;
  const t = s.tarif ?? DEFAULT_TARIF;
  const base = c.kind === 'ramsch' ? t.sauspiel : isSoloLike(c) ? t.solo : t.sauspiel;
  return base * (isTout(c) ? 2 : 1) * ((s.kontra ?? null) !== null ? 2 : 1) * ((s.re ?? null) !== null ? 2 : 1) * (s.bock ?? 1);
}

export function encode(s: GameState, me: number, out = new Float32Array(FEATURES)): Float32Array {
  out.fill(0);
  const c = s.contract!;
  const rel = (p: number) => (p - me + 4) % 4;
  let o = 0;
  const seen = new Set<string>();
  for (const x of s.hands[me]) {
    out[o + CARD_INDEX[x]] = 1;
    seen.add(x);
  }
  o += 32;
  const pts = [0, 0, 0, 0];
  const voids: boolean[][] = [0, 1, 2, 3].map(() => [false, false, false, false, false]);
  for (const t of s.tricks) {
    const led = effectiveSuit(t.cards[0], c);
    t.cards.forEach((x, i) => {
      const p = (t.leader + i) % 4;
      out[o + rel(p) * 32 + CARD_INDEX[x]] = 1;
      seen.add(x);
      if (effectiveSuit(x, c) !== led) voids[rel(p)][ESUITS.indexOf(led)] = true;
    });
    pts[rel(t.winner!)] += sumPoints(t.cards);
  }
  o += 128;
  const cur = s.current;
  if (cur && cur.cards.length) {
    const led = effectiveSuit(cur.cards[0], c);
    cur.cards.forEach((x, i) => {
      const r = rel((cur.leader + i) % 4);
      if (r > 0) out[o + (r - 1) * 32 + CARD_INDEX[x]] = 1;
      seen.add(x);
      if (effectiveSuit(x, c) !== led) voids[r][ESUITS.indexOf(led)] = true;
    });
  }
  o += 96;
  // Offene Hand beim Bettel Brett zählt als bekannt, bleibt aber "unbekannt im Spiel" für die Maske unten.
  for (let i = 0; i < 32; i++) if (!seen.has(CARDS[i])) out[o + i] = 1;
  o += 32;
  for (let i = 0; i < 32; i++) {
    const tp = trumpPower(CARDS[i], c);
    if (tp >= 0) {
      out[o + i] = 1;
      out[o + 32 + i] = (tp + 1) / 21;
    }
    out[o + 64 + i] = pointsOf(CARDS[i]) / 11;
  }
  o += 96;
  out[o + KINDS.indexOf(c.kind)] = 1;
  o += 9;
  if ('suit' in c && c.suit) out[o + SUITS.indexOf(c.suit)] = 1;
  o += 4;
  if (isTout(c)) out[o] = 1;
  if (c.kind === 'bettel' && c.brett) out[o + 1] = 1;
  o += 2;
  if (s.declarer !== null) out[o + rel(s.declarer)] = 1;
  o += 4;
  if (c.kind !== 'sie') {
    for (const p of knownTeammates(s, me)) out[o + rel(p)] = 1;
    for (const p of knownEnemies(s, me)) out[o + 4 + rel(p)] = 1;
  }
  o += 8;
  const n = cur ? cur.cards.length : 0;
  out[o + n] = 1;
  o += 4;
  if (cur && n) {
    out[o + rel((cur.leader + trickWinnerIndex(cur.cards, c)) % 4)] = 1;
    out[o + 4] = sumPoints(cur.cards) / 44;
  }
  o += 5;
  out[o++] = s.tricks.length / 8;
  for (let r = 0; r < 4; r++) out[o + r] = pts[r] / 120;
  o += 4;
  for (let r = 1; r < 4; r++) for (let k = 0; k < 5; k++) out[o + (r - 1) * 5 + k] = voids[r][k] ? 1 : 0;
  o += 15;
  out[o++] = (s.kontra ?? null) !== null ? 1 : 0;
  out[o++] = (s.re ?? null) !== null ? 1 : 0;
  out[o++] = c.kind === 'sauspiel' && sauGesucht(s) ? 1 : 0;
  out[o++] = c.kind === 'sauspiel' && calledAcePlayed(s) ? 1 : 0;
  const onDeclarerSide = s.declarer === me || (s.partner === me && c.kind !== 'ramsch');
  out[o++] = onDeclarerSide ? 1 : 0;
  if (o !== FEATURES) throw new Error(`Merkmale: ${o} statt ${FEATURES}`);
  return out;
}
