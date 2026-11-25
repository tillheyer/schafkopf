import { CardId, Suit, SUITS, rankOf, suitOf, SUIT_NAMES } from './cards';

/** Spielarten der ersten Version. */
export type Contract =
  | { kind: 'sauspiel'; suit: Suit } // suit = gerufene Sau
  | { kind: 'wenz' }
  | { kind: 'solo'; suit: Suit }; // suit = Trumpffarbe

export const contractRank = (c: Contract): number =>
  c.kind === 'sauspiel' ? 1 : c.kind === 'wenz' ? 2 : 3;

export function contractName(c: Contract): string {
  switch (c.kind) {
    case 'sauspiel':
      return `Sauspiel auf die ${SUIT_NAMES[c.suit]}-Sau`;
    case 'wenz':
      return 'Wenz';
    case 'solo':
      return `${SUIT_NAMES[c.suit]}-Solo`;
  }
}

export const sameContract = (a: Contract | null, b: Contract | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Reihenfolge der Farben bei Obern und Untern: Eichel > Gras > Herz > Schellen. */
const OU_ORDER: Suit[] = ['E', 'G', 'H', 'S'];
/** Rangfolge innerhalb einer Farbe (hoch nach niedrig), ohne Ober/Unter. */
const SUIT_ORDER_NORMAL = ['A', '10', 'K', '9', '8', '7'];
/** Beim Wenz sind die Ober normale Farbkarten zwischen König und Neun. */
const SUIT_ORDER_WENZ = ['A', '10', 'K', 'O', '9', '8', '7'];

export function trumpSuit(c: Contract): Suit | null {
  if (c.kind === 'sauspiel') return 'H';
  if (c.kind === 'solo') return c.suit;
  return null;
}

export function isTrump(card: CardId, c: Contract): boolean {
  const r = rankOf(card);
  if (c.kind === 'wenz') return r === 'U';
  return r === 'O' || r === 'U' || suitOf(card) === trumpSuit(c);
}

/** "T" für Trumpf, sonst die Farbe, zu der die Karte beim Bedienen zählt. */
export type EffectiveSuit = Suit | 'T';
export const effectiveSuit = (card: CardId, c: Contract): EffectiveSuit =>
  isTrump(card, c) ? 'T' : suitOf(card);

/** Stärke eines Trumpfs (größer = stärker), -1 wenn kein Trumpf. */
export function trumpPower(card: CardId, c: Contract): number {
  if (!isTrump(card, c)) return -1;
  const r = rankOf(card);
  const s = suitOf(card);
  if (c.kind === 'wenz') return 20 - OU_ORDER.indexOf(s);
  if (r === 'O') return 20 - OU_ORDER.indexOf(s);
  if (r === 'U') return 16 - OU_ORDER.indexOf(s);
  return 12 - SUIT_ORDER_NORMAL.indexOf(r);
}

/** Stärke innerhalb einer Fehlfarbe (größer = stärker). */
export function suitPower(card: CardId, c: Contract): number {
  const order = c.kind === 'wenz' ? SUIT_ORDER_WENZ : SUIT_ORDER_NORMAL;
  return order.length - order.indexOf(rankOf(card));
}

/** Index der Karte, die den Stich (bisher) gewinnt. */
export function trickWinnerIndex(cards: readonly CardId[], c: Contract): number {
  let best = 0;
  for (let i = 1; i < cards.length; i++) {
    if (beats(cards[i], cards[best], cards[0], c)) best = i;
  }
  return best;
}

/** Schlägt `a` die bisher höchste Karte `b`, wenn `led` ausgespielt wurde? */
export function beats(a: CardId, b: CardId, led: CardId, c: Contract): boolean {
  const ta = trumpPower(a, c);
  const tb = trumpPower(b, c);
  if (ta >= 0 || tb >= 0) return ta > tb;
  const ledSuit = suitOf(led);
  if (suitOf(a) !== ledSuit) return false;
  if (suitOf(b) !== ledSuit) return true;
  return suitPower(a, c) > suitPower(b, c);
}

/** Alle Trümpfe von hoch nach niedrig (für die Laufenden). */
export function trumpOrder(c: Contract): CardId[] {
  const all: CardId[] = [];
  for (const s of SUITS) for (const r of ['7', '8', '9', '10', 'U', 'O', 'K', 'A']) all.push(`${s}${r}` as CardId);
  return all.filter((x) => isTrump(x, c)).sort((a, b) => trumpPower(b, c) - trumpPower(a, c));
}
