import { CardId, Suit, SUITS, rankOf, suitOf, SUIT_NAMES } from './cards';

/** Spielarten. `tout` = Ansage, alle Stiche zu machen (verdoppelt). */
export type Contract =
  | { kind: 'sauspiel'; suit: Suit } // suit = gerufene Sau
  | { kind: 'hochzeit' } // Partner nimmt den einzigen Trumpf auf
  | { kind: 'ramsch' } // alle gegen alle, wenn niemand spielt
  | { kind: 'bettel'; brett?: boolean } // Nullspiel, Brett = offen
  | { kind: 'wenz'; tout?: boolean }
  | { kind: 'geier'; tout?: boolean }
  | { kind: 'farbwenz'; suit: Suit; tout?: boolean }
  | { kind: 'farbgeier'; suit: Suit; tout?: boolean }
  | { kind: 'solo'; suit: Suit; tout?: boolean } // suit = Trumpffarbe
  | { kind: 'sie' }; // alle Ober und Unter auf der Hand

export type ContractKind = Contract['kind'];

/** Solospiele (einer gegen drei), bei denen Tout angesagt werden kann. */
export const TOUT_KINDS: ContractKind[] = ['wenz', 'geier', 'farbwenz', 'farbgeier', 'solo'];
export const isTout = (c: Contract): boolean => 'tout' in c && !!c.tout;
/** Einer gegen drei? */
export const isSoloLike = (c: Contract): boolean => !['sauspiel', 'hochzeit', 'ramsch'].includes(c.kind);

/**
 * Rangfolge beim Reizen (höher sticht niedriger).
 * ANNAHME: Sauspiel/Hochzeit < Bettel < Farbwenz/Farbgeier < Wenz/Geier < Solo < Bettel Brett,
 * jedes Tout steht über allen Spielen ohne Tout. Sie ist das höchste Spiel.
 */
export function contractRank(c: Contract): number {
  const base: Record<ContractKind, number> = {
    sauspiel: 1,
    hochzeit: 1,
    ramsch: 0,
    bettel: 2,
    farbwenz: 3,
    farbgeier: 3,
    wenz: 4,
    geier: 4,
    solo: 5,
    sie: 20,
  };
  if (c.kind === 'bettel' && c.brett) return 6;
  return base[c.kind] + (isTout(c) ? 6 : 0);
}

export function contractName(c: Contract): string {
  const tout = isTout(c) ? ' Tout' : '';
  switch (c.kind) {
    case 'sauspiel':
      return `Sauspiel auf die ${SUIT_NAMES[c.suit]}-Sau`;
    case 'hochzeit':
      return 'Hochzeit';
    case 'ramsch':
      return 'Ramsch';
    case 'bettel':
      return c.brett ? 'Bettel Brett' : 'Bettel';
    case 'wenz':
      return `Wenz${tout}`;
    case 'geier':
      return `Geier${tout}`;
    case 'farbwenz':
      return `${SUIT_NAMES[c.suit]}-Wenz${tout}`;
    case 'farbgeier':
      return `${SUIT_NAMES[c.suit]}-Geier${tout}`;
    case 'solo':
      return `${SUIT_NAMES[c.suit]}-Solo${tout}`;
    case 'sie':
      return 'Sie';
  }
}

export const sameContract = (a: Contract | null, b: Contract | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Reihenfolge der Farben bei Obern und Untern: Eichel > Gras > Herz > Schellen. */
const OU_ORDER: Suit[] = ['E', 'G', 'H', 'S'];

/** Welche Bilder sind Trumpf ("O", "U", beide oder keine) und welche Farbe? */
function trumpCfg(c: Contract): { tops: string[]; suit: Suit | null } {
  switch (c.kind) {
    case 'sauspiel':
    case 'hochzeit':
    case 'ramsch':
    case 'sie':
      return { tops: ['O', 'U'], suit: 'H' };
    case 'solo':
      return { tops: ['O', 'U'], suit: c.suit };
    case 'wenz':
      return { tops: ['U'], suit: null };
    case 'farbwenz':
      return { tops: ['U'], suit: c.suit };
    case 'geier':
      return { tops: ['O'], suit: null };
    case 'farbgeier':
      return { tops: ['O'], suit: c.suit };
    case 'bettel':
      return { tops: [], suit: null };
  }
}

/** Rangfolge innerhalb einer Farbe (hoch nach niedrig) für Karten, die keine Trumpf-Bilder sind. */
function suitOrder(c: Contract): string[] {
  if (c.kind === 'bettel') return ['A', 'K', 'O', 'U', '10', '9', '8', '7'];
  const tops = trumpCfg(c).tops;
  if (tops.length === 2) return ['A', '10', 'K', '9', '8', '7'];
  if (tops[0] === 'U') return ['A', '10', 'K', 'O', '9', '8', '7'];
  return ['A', '10', 'K', 'U', '9', '8', '7'];
}

export function trumpSuit(c: Contract): Suit | null {
  return trumpCfg(c).suit;
}

export function isTrump(card: CardId, c: Contract): boolean {
  const { tops, suit } = trumpCfg(c);
  return tops.includes(rankOf(card)) || suitOf(card) === suit;
}

/** "T" für Trumpf, sonst die Farbe, zu der die Karte beim Bedienen zählt. */
export type EffectiveSuit = Suit | 'T';
export const effectiveSuit = (card: CardId, c: Contract): EffectiveSuit =>
  isTrump(card, c) ? 'T' : suitOf(card);

/** Stärke eines Trumpfs (größer = stärker), -1 wenn kein Trumpf. */
export function trumpPower(card: CardId, c: Contract): number {
  if (!isTrump(card, c)) return -1;
  const { tops } = trumpCfg(c);
  const r = rankOf(card);
  const s = suitOf(card);
  if (tops.includes(r)) {
    // Ober vor Untern; innerhalb Eichel > Gras > Herz > Schellen.
    return (r === 'O' || tops.length === 1 ? 20 : 16) - OU_ORDER.indexOf(s);
  }
  const order = suitOrder(c);
  return 12 - order.indexOf(r);
}

/** Stärke innerhalb einer Fehlfarbe (größer = stärker). */
export function suitPower(card: CardId, c: Contract): number {
  const order = suitOrder(c);
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
