import { CardId, fullDeck, rankOf, suitOf, sumPoints, Suit } from './cards';
import { Contract, contractRank, effectiveSuit, trickWinnerIndex } from './rules';
import { Rng, shuffle } from './rng';
import { GameResult, scoreGame, Tarif } from './scoring';

/**
 * Reiner Spielzustand + Reducer. Keine UI-Abhängigkeiten, alles JSON-serialisierbar.
 * Für den Online-Modus kann ein Server genau diesen Code ausführen und den Clients
 * jeweils nur die eigene Hand schicken.
 */
export type Phase = 'bidding' | 'playing' | 'finished';

export interface Trick {
  leader: number;
  cards: CardId[];
  winner?: number;
}

export interface Bid {
  player: number;
  contract: Contract | null; // null = "weiter"
}

export interface GameState {
  dealer: number;
  initialHands: CardId[][];
  hands: CardId[][];
  phase: Phase;
  bids: Bid[];
  /** Wer gerade dran ist (bieten oder spielen). */
  turn: number;
  contract: Contract | null;
  declarer: number | null;
  /** Mitspieler im Sauspiel (Besitzer der gerufenen Sau). Geheime Information! */
  partner: number | null;
  tricks: Trick[];
  current: Trick | null;
  result: GameResult | null;
  tarif?: Tarif;
  /** Wer Kontra gegeben hat (Gegenpartei), sonst null. */
  kontra?: number | null;
  /** Wer Re gegeben hat (Spielerpartei), sonst null. */
  re?: number | null;
}

export type Action =
  | { type: 'bid'; player: number; contract: Contract | null }
  | { type: 'play'; player: number; card: CardId }
  | { type: 'kontra'; player: number }
  | { type: 're'; player: number };

export const next = (p: number): number => (p + 1) % 4;
export const forehand = (s: GameState): number => next(s.dealer);

export function newGame(dealer: number, rng: Rng, tarif?: Tarif): GameState {
  const deck = shuffle(fullDeck(), rng);
  const hands: CardId[][] = [0, 1, 2, 3].map((i) => deck.slice(i * 8, i * 8 + 8));
  return {
    dealer,
    initialHands: hands.map((h) => [...h]),
    hands,
    phase: 'bidding',
    bids: [],
    turn: next(dealer),
    contract: null,
    declarer: null,
    partner: null,
    tricks: [],
    current: null,
    result: null,
    tarif,
    kontra: null,
    re: null,
  };
}

// ---------------------------------------------------------------- Reizen

/** Auf welche Sau darf dieser Spieler rufen? (Farbe in der Hand, Sau nicht.) */
export function callableSuits(hand: readonly CardId[]): Suit[] {
  return (['E', 'G', 'S'] as Suit[]).filter(
    (s) =>
      !hand.includes(`${s}A` as CardId) &&
      hand.some((c) => suitOf(c) === s && rankOf(c) !== 'O' && rankOf(c) !== 'U'),
  );
}

export function highestBid(s: GameState): Bid | null {
  let best: Bid | null = null;
  for (const b of s.bids) {
    if (b.contract && (!best || contractRank(b.contract) > contractRank(best.contract!))) best = b;
  }
  return best;
}

/**
 * ANNAHME (vereinfachtes Reizen): Jeder sagt einmal reihum ab der Vorhand an.
 * Ein späterer Spieler muss ein höheres Spiel ansagen (Sauspiel < Wenz < Solo);
 * bei gleichem Spiel hat der Vordere Vorrang.
 */
export function legalBids(s: GameState, player: number): (Contract | null)[] {
  if (s.phase !== 'bidding' || s.turn !== player) return [];
  const min = highestBid(s) ? contractRank(highestBid(s)!.contract!) + 1 : 1;
  const out: (Contract | null)[] = [null];
  if (min <= 1) for (const suit of callableSuits(s.hands[player])) out.push({ kind: 'sauspiel', suit });
  if (min <= 2) out.push({ kind: 'wenz' });
  if (min <= 3) for (const suit of ['E', 'G', 'H', 'S'] as Suit[]) out.push({ kind: 'solo', suit });
  return out;
}

// ---------------------------------------------------------------- Spielen

const calledAce = (s: GameState): CardId | null =>
  s.contract?.kind === 'sauspiel' ? (`${s.contract.suit}A` as CardId) : null;

/** Ist die gerufene Farbe schon gesucht worden (ausgespielt) bzw. die Sau gefallen? */
export function sauGesucht(s: GameState): boolean {
  const ace = calledAce(s);
  if (!ace || !s.contract) return true;
  const suit = suitOf(ace);
  const all = [...s.tricks, ...(s.current ? [s.current] : [])];
  if (all.some((t) => t.cards.includes(ace))) return true;
  return s.tricks.some((t) => effectiveSuit(t.cards[0], s.contract!) === suit);
}

export function calledAcePlayed(s: GameState): boolean {
  const ace = calledAce(s);
  if (!ace) return true;
  return [...s.tricks, ...(s.current ? [s.current] : [])].some((t) => t.cards.includes(ace));
}

export function legalCards(s: GameState, player: number): CardId[] {
  if (s.phase !== 'playing' || s.turn !== player || !s.contract) return [];
  const c = s.contract;
  const hand = s.hands[player];
  const ace = calledAce(s);
  const holdsAce = ace !== null && hand.includes(ace) && !sauGesucht(s);
  const trick = s.current;

  if (!trick || trick.cards.length === 0) {
    if (!holdsAce) return [...hand];
    // Wer die gerufene Sau hat, darf die Farbe nur mit der Sau anspielen,
    // außer er hat 4 oder mehr Karten der Farbe ("davonlaufen").
    const suit = suitOf(ace!);
    const suitCards = hand.filter((x) => effectiveSuit(x, c) === suit);
    if (suitCards.length >= 4) return [...hand];
    return hand.filter((x) => effectiveSuit(x, c) !== suit || x === ace);
  }

  const led = effectiveSuit(trick.cards[0], c);
  const follow = hand.filter((x) => effectiveSuit(x, c) === led);
  if (follow.length > 0) {
    // Wird die gerufene Farbe gesucht, muss die Sau zugegeben werden.
    if (holdsAce && led === suitOf(ace!)) return [ace!];
    return follow;
  }
  // Nicht bedienen können: frei, aber die gerufene Sau darf nicht geschmiert werden.
  if (holdsAce) {
    const rest = hand.filter((x) => x !== ace);
    if (rest.length > 0) return rest;
  }
  return [...hand];
}

// ---------------------------------------------------------------- Kontra und Re

/** Spielerpartei (im Sauspiel Spieler + Sau-Besitzer). */
export function declarerTeam(s: GameState): number[] {
  if (s.declarer === null) return [];
  return s.partner === null ? [s.declarer] : [s.declarer, s.partner];
}

/** Hat der Spieler schon eine Karte gespielt? */
function hasPlayed(s: GameState, p: number): boolean {
  if (s.tricks.length > 0) return true;
  const t = s.current;
  if (!t) return false;
  return (p - t.leader + 4) % 4 < t.cards.length;
}

/**
 * ANNAHME: Kontra darf jeder aus der Gegenpartei geben, solange er selbst noch
 * keine Karte zugegeben hat. Re darf die Spielerpartei nach einem Kontra geben,
 * solange der erste Stich läuft. Jedes verdoppelt den Spielwert.
 */
export function canKontra(s: GameState, p: number): boolean {
  if (s.phase !== 'playing' || s.declarer === null || (s.kontra ?? null) !== null) return false;
  if (p === s.declarer || p === s.partner) return false;
  return !hasPlayed(s, p);
}

export function canRe(s: GameState, p: number): boolean {
  if (s.phase !== 'playing' || (s.kontra ?? null) === null || (s.re ?? null) !== null) return false;
  if (p !== s.declarer && p !== s.partner) return false;
  return s.tricks.length === 0;
}

// ---------------------------------------------------------------- Reducer

export function applyAction(s: GameState, a: Action): GameState {
  if (a.type === 'kontra') {
    if (!canKontra(s, a.player)) throw new Error('Kontra ist jetzt nicht möglich');
    return { ...s, kontra: a.player };
  }
  if (a.type === 're') {
    if (!canRe(s, a.player)) throw new Error('Re ist jetzt nicht möglich');
    return { ...s, re: a.player };
  }
  if (a.player !== s.turn) throw new Error(`Spieler ${a.player} ist nicht dran`);
  if (a.type === 'bid') return applyBid(s, a.contract);
  return applyPlay(s, a.card);
}

function applyBid(s: GameState, contract: Contract | null): GameState {
  const legal = legalBids(s, s.turn);
  if (!legal.some((b) => JSON.stringify(b) === JSON.stringify(contract))) {
    throw new Error('Ungültige Ansage');
  }
  const bids = [...s.bids, { player: s.turn, contract }];
  const st: GameState = { ...s, bids, turn: next(s.turn) };
  if (bids.length < 4) return st;

  const best = highestBid(st);
  if (!best) {
    return { ...st, phase: 'finished', result: { kind: 'zamgeworfen' } };
  }
  const ct = best.contract!;
  let partner: number | null = null;
  if (ct.kind === 'sauspiel') {
    partner = st.hands.findIndex((h) => h.includes(`${ct.suit}A` as CardId));
  }
  return {
    ...st,
    phase: 'playing',
    contract: ct,
    declarer: best.player,
    partner,
    turn: forehand(st),
    current: { leader: forehand(st), cards: [] },
  };
}

function applyPlay(s: GameState, card: CardId): GameState {
  if (!legalCards(s, s.turn).includes(card)) throw new Error(`Karte ${card} ist nicht erlaubt`);
  const hands = s.hands.map((h, i) => (i === s.turn ? h.filter((x) => x !== card) : h));
  const trick: Trick = { ...(s.current ?? { leader: s.turn, cards: [] }) };
  trick.cards = [...trick.cards, card];

  if (trick.cards.length < 4) {
    return { ...s, hands, current: trick, turn: next(s.turn) };
  }
  const winner = (trick.leader + trickWinnerIndex(trick.cards, s.contract!)) % 4;
  const tricks = [...s.tricks, { ...trick, winner }];
  const st: GameState = { ...s, hands, tricks, turn: winner, current: { leader: winner, cards: [] } };
  if (tricks.length < 8) return st;

  const team = s.partner === null ? [s.declarer!] : [s.declarer!, s.partner];
  const won = tricks.filter((t) => team.includes(t.winner!));
  const result = scoreGame({
    contract: s.contract!,
    declarer: s.declarer!,
    partner: s.partner,
    declarerPoints: sumPoints(won.flatMap((t) => t.cards)),
    declarerTricks: won.length,
    initialHands: s.initialHands,
    tarif: s.tarif,
    kontra: (s.kontra ?? null) !== null,
    re: (s.re ?? null) !== null,
  });
  return { ...st, phase: 'finished', current: null, result };
}

/** Augen, die ein Spieler bisher gestochen hat. */
export function pointsWon(s: GameState, player: number): number {
  return sumPoints(s.tricks.filter((t) => t.winner === player).flatMap((t) => t.cards));
}
