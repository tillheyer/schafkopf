import { CardId, fullDeck, rankOf, suitOf, sumPoints, Suit } from './cards';
import { Contract, contractRank, effectiveSuit, isTout, isTrump, trickWinnerIndex } from './rules';
import { DEFAULT_RULES, Rules } from './options';
import { Rng, shuffle } from './rng';
import { GameResult, scoreGame, scoreRamsch, Tarif } from './scoring';

/**
 * Reiner Spielzustand + Reducer. Keine UI-Abhängigkeiten, alles JSON-serialisierbar.
 * Für den Online-Modus kann ein Server genau diesen Code ausführen und den Clients
 * jeweils nur die eigene Hand schicken.
 */
export type Phase = 'bidding' | 'hochzeit' | 'playing' | 'finished';

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
  /** Eingeschaltete Sonderregeln. */
  rules?: Rules;
  /** Faktor durch Bockrunden (1, 2, 4 …). */
  bock?: number;
  /** Muss-Spiel: wer den Eichel-Ober hat, muss ansagen. */
  muss?: boolean;
}

export interface GameOptions {
  tarif?: Tarif;
  rules?: Rules;
  bock?: number;
  muss?: boolean;
}

export type Action =
  | { type: 'bid'; player: number; contract: Contract | null }
  | { type: 'play'; player: number; card: CardId }
  | { type: 'kontra'; player: number }
  | { type: 're'; player: number }
  /** Hochzeit annehmen (mit abgegebener Karte) oder ablehnen. */
  | { type: 'hochzeit'; player: number; accept: boolean; give?: CardId };

export const next = (p: number): number => (p + 1) % 4;
export const forehand = (s: GameState): number => next(s.dealer);

export function newGame(dealer: number, rng: Rng, opts: GameOptions = {}): GameState {
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
    tarif: opts.tarif,
    kontra: null,
    re: null,
    rules: opts.rules ?? DEFAULT_RULES,
    bock: opts.bock ?? 1,
    muss: !!opts.muss,
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

const rulesOf = (s: GameState): Rules => s.rules ?? DEFAULT_RULES;
const SUITS4: Suit[] = ['E', 'G', 'H', 'S'];

/** Anzahl Trümpfe wie im Sauspiel (für die Hochzeit). */
const sauTrumps = (hand: readonly CardId[]) => hand.filter((c) => isTrump(c, { kind: 'sauspiel', suit: 'E' }));

/** Muss dieser Spieler im Muss-Spiel ansagen? (Eichel-Ober und noch kein Spiel angesagt.) */
export function mustBid(s: GameState, player: number): boolean {
  return !!s.muss && rulesOf(s).muss && s.hands[player].includes('EO') && !highestBid(s);
}

/**
 * ANNAHME (vereinfachtes Reizen): Jeder sagt einmal reihum ab der Vorhand an.
 * Ein späterer Spieler muss ein höheres Spiel ansagen (siehe contractRank);
 * bei gleichem Spiel hat der Vordere Vorrang.
 */
export function legalBids(s: GameState, player: number): (Contract | null)[] {
  if (s.phase !== 'bidding' || s.turn !== player) return [];
  const r = rulesOf(s);
  const hand = s.hands[player];
  const min = highestBid(s) ? contractRank(highestBid(s)!.contract!) + 1 : 1;
  const all: Contract[] = [];
  for (const suit of callableSuits(hand)) all.push({ kind: 'sauspiel', suit });
  if (r.hochzeit && sauTrumps(hand).length === 1) all.push({ kind: 'hochzeit' });
  if (r.bettel) all.push({ kind: 'bettel' });
  if (r.farbwenz) for (const suit of SUITS4) all.push({ kind: 'farbwenz', suit });
  if (r.farbgeier) for (const suit of SUITS4) all.push({ kind: 'farbgeier', suit });
  all.push({ kind: 'wenz' });
  if (r.geier) all.push({ kind: 'geier' });
  for (const suit of SUITS4) all.push({ kind: 'solo', suit });
  if (r.bettel) all.push({ kind: 'bettel', brett: true });
  if (r.tout) {
    const touts = all.filter((c) => ['wenz', 'geier', 'farbwenz', 'farbgeier', 'solo'].includes(c.kind));
    for (const c of touts) all.push({ ...c, tout: true } as Contract);
  }
  if (r.sie && hand.length === 8 && hand.every((c) => rankOf(c) === 'O' || rankOf(c) === 'U')) all.push({ kind: 'sie' });
  const out: (Contract | null)[] = mustBid(s, player) ? [] : [null];
  return [...out, ...all.filter((c) => contractRank(c) >= min)];
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
  if (a.type === 'hochzeit') return applyHochzeit(s, a.accept, a.give);
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
  if (!best) return noGame(st);
  const ct = best.contract!;
  if (ct.kind === 'sie') {
    const result = scoreGame({
      contract: ct,
      declarer: best.player,
      partner: null,
      declarerPoints: 120,
      declarerTricks: 8,
      initialHands: st.initialHands,
      tarif: st.tarif,
      bock: st.bock,
    });
    return { ...st, phase: 'finished', contract: ct, declarer: best.player, result };
  }
  if (ct.kind === 'hochzeit') {
    return { ...st, phase: 'hochzeit', contract: ct, declarer: best.player, turn: next(best.player) };
  }
  let partner: number | null = null;
  if (ct.kind === 'sauspiel') {
    partner = st.hands.findIndex((h) => h.includes(`${ct.suit}A` as CardId));
  }
  return startPlay({ ...st, contract: ct, declarer: best.player, partner });
}

function startPlay(s: GameState): GameState {
  return { ...s, phase: 'playing', turn: forehand(s), current: { leader: forehand(s), cards: [] } };
}

/** Niemand spielt: Ramsch (wenn eingeschaltet) oder zusammenwerfen. */
function noGame(s: GameState): GameState {
  if (rulesOf(s).ramsch) {
    return startPlay({ ...s, contract: { kind: 'ramsch' }, declarer: null, partner: null });
  }
  return { ...s, phase: 'finished', contract: null, declarer: null, result: { kind: 'zamgeworfen' } };
}

/** Darf/muss dieser Spieler über die Hochzeit entscheiden? */
export function canAnswerHochzeit(s: GameState, p: number): boolean {
  return s.phase === 'hochzeit' && s.turn === p && p !== s.declarer;
}

function applyHochzeit(s: GameState, accept: boolean, give?: CardId): GameState {
  if (s.phase !== 'hochzeit' || s.declarer === null) throw new Error('Keine Hochzeit');
  const p = s.turn;
  if (!accept) {
    const t = next(p);
    if (t === s.declarer) return noGame({ ...s, contract: null, declarer: null });
    return { ...s, turn: t };
  }
  if (!give || !s.hands[p].includes(give)) throw new Error('Welche Karte gibst du ab?');
  const d = s.declarer;
  const trump = sauTrumps(s.hands[d])[0];
  const hands = s.hands.map((h) => [...h]);
  hands[d] = hands[d].filter((c) => c !== trump).concat(give);
  hands[p] = hands[p].filter((c) => c !== give).concat(trump);
  return startPlay({ ...s, hands, initialHands: hands.map((h) => [...h]), partner: p });
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
  const c = s.contract!;
  if (c.kind === 'ramsch') {
    if (tricks.length < 8) return st;
    return { ...st, phase: 'finished', current: null, result: scoreRamsch(tricks, s.tarif, s.bock) };
  }
  const team = s.partner === null ? [s.declarer!] : [s.declarer!, s.partner];
  // Bettel ist verloren, sobald der Spieler einen Stich macht; Tout, sobald er einen abgibt.
  const decided = (c.kind === 'bettel' && team.includes(winner)) || (isTout(c) && !team.includes(winner));
  if (tricks.length < 8 && !decided) return st;

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
    bock: s.bock,
  });
  return { ...st, phase: 'finished', current: null, result };
}

/** Augen, die ein Spieler bisher gestochen hat. */
export function pointsWon(s: GameState, player: number): number {
  return sumPoints(s.tricks.filter((t) => t.winner === player).flatMap((t) => t.cards));
}
