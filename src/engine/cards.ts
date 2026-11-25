/**
 * Karten des bayerischen Blatts (32 Karten).
 * Karten werden als kurze Strings dargestellt, z.B. "EO" = Eichel-Ober,
 * "H10" = Herz-Zehn. So bleibt der Spielzustand JSON-serialisierbar
 * (wichtig für den späteren Online-Modus).
 */
export const SUITS = ['E', 'G', 'H', 'S'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['7', '8', '9', '10', 'U', 'O', 'K', 'A'] as const;
export type Rank = (typeof RANKS)[number];

export type CardId = `${Suit}${Rank}`;

export const SUIT_NAMES: Record<Suit, string> = {
  E: 'Eichel',
  G: 'Gras',
  H: 'Herz',
  S: 'Schellen',
};

export const RANK_NAMES: Record<Rank, string> = {
  '7': 'Sieben',
  '8': 'Acht',
  '9': 'Neun',
  '10': 'Zehn',
  U: 'Unter',
  O: 'Ober',
  K: 'König',
  A: 'Sau',
};

/** Augen pro Kartenwert. Summe über alle Karten = 120. */
export const POINTS: Record<Rank, number> = {
  A: 11,
  '10': 10,
  K: 4,
  O: 3,
  U: 2,
  '9': 0,
  '8': 0,
  '7': 0,
};

export const suitOf = (c: CardId): Suit => c[0] as Suit;
export const rankOf = (c: CardId): Rank => c.slice(1) as Rank;
export const pointsOf = (c: CardId): number => POINTS[rankOf(c)];
export const sumPoints = (cards: readonly CardId[]): number =>
  cards.reduce((s, c) => s + pointsOf(c), 0);

export const cardName = (c: CardId): string =>
  `${SUIT_NAMES[suitOf(c)]}-${RANK_NAMES[rankOf(c)]}`;

export function fullDeck(): CardId[] {
  const deck: CardId[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${s}${r}` as CardId);
  return deck;
}
