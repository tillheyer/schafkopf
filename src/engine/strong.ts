import { CardId, fullDeck, pointsOf, rankOf, suitOf, sumPoints, Suit } from './cards';
import {
  Contract,
  EffectiveSuit,
  beats,
  effectiveSuit,
  isSoloLike,
  isTout,
  suitPower,
  isTrump,
  trickWinnerIndex,
  trumpOrder,
  trumpPower,
} from './rules';
import {
  Action,
  GameState,
  applyAction,
  callableSuits,
  canKontra,
  canRe,
  legalBids,
  legalCards,
  newGame,
  next,
} from './game';
import { chooseAction as chooseNormal, chooseBid, chooseCard as chooseNormalCard, knownEnemies } from './ai';
import { redactFor } from './redact';
import { DEFAULT_TARIF, scoreGame } from './scoring';
import { Rng, createRng, shuffle } from './rng';

/**
 * Sehr starker Computergegner.
 *
 * Grundsatz: Er sieht nur, was ein echter Spieler am Tisch auch weiß. Deshalb
 * arbeitet er ausschließlich mit `redactFor(state, me)`: eigene Hand, gespielte
 * Karten, Ansagen, Kontra/Re und (offen gelegte) Bettel-Brett-Karten.
 *
 * Vorgehen (Monte-Carlo mit "Determinisierung"):
 *  1. Aus dem Spielverlauf ableiten, was über fremde Hände bekannt ist:
 *     gespielte Karten, wer welche Farbe nicht mehr hat (nicht bedient),
 *     wo die gerufene Sau sein kann, dass der Spieler die Ruffarbe noch hat …
 *  2. Viele mögliche Kartenverteilungen ziehen, die dazu passen.
 *  3. Jede Verteilung nach Wahrscheinlichkeit gewichten: Ansagen (wer spielt,
 *     hat Trümpfe; wer "weiter" sagt, eher nicht), Kontra, und Hinweise auf die
 *     Partnerschaft im Sauspiel (wer schmiert wem, wer spielt Trumpf an …).
 *  4. Für jede erlaubte Karte jede Verteilung zu Ende spielen – gegen Ende exakt
 *     (vollständige Suche), vorher mit schnellen Ausspielregeln – und die Karte
 *     mit dem besten erwarteten Gewinn nehmen.
 */

export interface StrongOptions {
  /** Zeitbudget pro Entscheidung in Millisekunden (Standard 450). */
  timeMs?: number;
  /** Feste Anzahl Verteilungen (für Tests); überschreibt das Zeitbudget. */
  samples?: number;
  /** Zufallsquelle (für reproduzierbare Tests). */
  rng?: Rng;
  /** Nur zur Fehlersuche: erwarteter Wert jeder Karte. */
  onScores?: (cards: CardId[], values: number[]) => void;
  /** Ab wie vielen Karten im Spiel exakt gerechnet wird (Standard 12). */
  exactCards?: number;
}

const ALL: CardId[] = fullDeck();
const PLAYERS = [0, 1, 2, 3];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function chooseStrongAction(full: GameState, me: number, opts: StrongOptions = {}): Action {
  // Ab hier nur noch die Sicht des Spielers verwenden – keine fremden Karten!
  const s = redactFor(full, me);
  const rng = opts.rng ?? Math.random;
  if (s.phase === 'bidding') return { type: 'bid', player: me, contract: chooseStrongBid(s, me, rng, opts) };
  if (s.phase === 'hochzeit') return chooseNormal(s, me);
  if (s.phase !== 'playing') return chooseNormal(s, me);
  if (canKontra(s, me) || canRe(s, me)) {
    const est = estimate(s, me, rng, opts);
    if (canKontra(s, me) && est.winProb >= 0.68 && est.ev > 0) return { type: 'kontra', player: me };
    if (canRe(s, me) && est.winProb >= 0.72 && est.ev > 0) return { type: 're', player: me };
  }
  return { type: 'play', player: me, card: chooseStrongCard(s, me, rng, opts) };
}

// =============================================================== Wissen

interface Knowledge {
  /** Karten, deren Besitzer unbekannt ist. */
  unknown: CardId[];
  /** Feste Zuordnung bekannter Karten (z.B. offene Bettel-Brett-Hand). */
  fixed: Map<CardId, number>;
  /** Wie viele Karten jeder Spieler noch hat. */
  size: number[];
  /** Farben (bzw. Trumpf), die ein Spieler sicher nicht mehr hat. */
  voids: Set<EffectiveSuit>[];
  /** Gerufene Sau, falls noch nicht gefallen. */
  ace: CardId | null;
  /** Bekannter Besitzer der gerufenen Sau (davongelaufen) oder null. */
  aceHolder: number | null;
  /** Spieler, die die gerufene Sau sicher nicht haben. */
  noAce: Set<number>;
  /** Der Sauspieler hat sicher noch eine Karte der Ruffarbe. */
  declarerHoldsCalledSuit: boolean;
}

function playedCards(s: GameState): CardId[] {
  return [...s.tricks.flatMap((t) => t.cards), ...(s.current?.cards ?? [])];
}

function allTricks(s: GameState) {
  return [...s.tricks, ...(s.current && s.current.cards.length ? [s.current] : [])];
}

function analyze(s: GameState, me: number): Knowledge {
  const c = s.contract!;
  const played = new Set(playedCards(s));
  const mine = new Set(s.hands[me]);
  const fixed = new Map<CardId, number>();
  // Offene Karten (Bettel Brett) sind bekannt.
  for (const p of PLAYERS) {
    if (p === me) continue;
    for (const x of s.hands[p]) if (x !== ('??' as CardId)) fixed.set(x, p);
  }
  const voids = PLAYERS.map(() => new Set<EffectiveSuit>());
  for (const t of allTricks(s)) {
    const led = effectiveSuit(t.cards[0], c);
    t.cards.forEach((x, i) => {
      if (i > 0 && effectiveSuit(x, c) !== led) voids[(t.leader + i) % 4].add(led);
    });
  }
  let ace: CardId | null = null;
  let aceHolder: number | null = null;
  let declarerHoldsCalledSuit = false;
  const noAce = new Set<number>();
  if (c.kind === 'sauspiel') {
    const a = `${c.suit}A` as CardId;
    if (!played.has(a) && !mine.has(a)) {
      ace = a;
      if (s.partner !== null && s.partner !== me) aceHolder = s.partner;
      // Wird die Ruffarbe zum ersten Mal angespielt, muss die Sau fallen. Fiel sie nicht,
      // ist der Ausspieler mit der Sau davongelaufen; wer schon ohne Sau zugegeben hat, hat sie nicht.
      const first = allTricks(s).find((t) => effectiveSuit(t.cards[0], c) === c.suit);
      if (first && aceHolder === null) {
        if (first !== s.current) aceHolder = first.leader;
        else for (let i = 1; i < first.cards.length; i++) noAce.add((first.leader + i) % 4);
      }
    }
    const d = s.declarer!;
    if (d !== me) {
      const declarerPlayedSuit = allTricks(s).some((t) =>
        t.cards.some((x, i) => (t.leader + i) % 4 === d && effectiveSuit(x, c) === c.suit),
      );
      declarerHoldsCalledSuit = !declarerPlayedSuit && !voids[d].has(c.suit);
    }
  }
  const unknown = ALL.filter((x) => !played.has(x) && !mine.has(x) && !fixed.has(x));
  return { unknown, fixed, size: s.hands.map((h) => h.length), voids, ace, aceHolder, noAce, declarerHoldsCalledSuit };
}

// =============================================================== Verteilungen ziehen

/** Eine zufällige, zum Wissen passende Verteilung der unbekannten Karten (oder null). */
function sampleDeal(s: GameState, me: number, k: Knowledge, rng: Rng): CardId[][] | null {
  const c = s.contract!;
  const soloist = isSoloLike(c) && c.kind !== 'bettel' && s.declarer !== me ? s.declarer : null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const hands: CardId[][] = PLAYERS.map((p) => (p === me ? [...s.hands[me]] : []));
    for (const [x, p] of k.fixed) hands[p].push(x);
    const room = PLAYERS.map((p) => (p === me ? 0 : k.size[p] - hands[p].length));
    const eligible = (x: CardId) =>
      PLAYERS.filter((p) => {
        if (p === me || room[p] <= 0) return false;
        if (x === k.ace) {
          if (k.aceHolder !== null) return p === k.aceHolder;
          if (p === s.declarer || k.noAce.has(p)) return false;
        }
        return !k.voids[p].has(effectiveSuit(x, c));
      });
    // Am stärksten eingeschränkte Karten zuerst verteilen.
    const cards = shuffle(k.unknown, rng)
      .map((x) => ({ x, n: eligible(x).length }))
      .sort((a, b) => a.n - b.n);
    let ok = true;
    for (const { x } of cards) {
      const el = eligible(x);
      if (!el.length) {
        ok = false;
        break;
      }
      // Nach freiem Platz gewichtet ziehen; Trümpfe landen eher beim Alleinspieler.
      const bias = (p: number) => room[p] * (p === soloist && isTrump(x, c) ? 2.5 : 1);
      const total = el.reduce((acc, p) => acc + bias(p), 0);
      let r = rng() * total;
      let pick = el[el.length - 1];
      for (const p of el) {
        r -= bias(p);
        if (r < 0) {
          pick = p;
          break;
        }
      }
      hands[pick].push(x);
      room[pick]--;
    }
    if (!ok) continue;
    if (k.declarerHoldsCalledSuit && c.kind === 'sauspiel') {
      const d = s.declarer!;
      if (!hands[d].some((x) => effectiveSuit(x, c) === c.suit)) continue;
    }
    return hands;
  }
  return null;
}

/** Ausgangshände einer Verteilung rekonstruieren (für Laufende und Gewichtung). */
function initialHandsOf(s: GameState, hands: CardId[][]): CardId[][] {
  const init = hands.map((h) => [...h]);
  for (const t of allTricks(s)) t.cards.forEach((x, i) => init[(t.leader + i) % 4].push(x));
  return init;
}

const cnt = (h: readonly CardId[], f: (x: CardId) => boolean) => h.reduce((n, x) => n + (f(x) ? 1 : 0), 0);

/** Wie gut passt eine Ausgangshand zu einer Ansage? (grobe Wahrscheinlichkeit) */
function bidLikelihood(hand: readonly CardId[], bid: Contract): number {
  const t = cnt(hand, (x) => isTrump(x, bid));
  const obers = cnt(hand, (x) => rankOf(x) === 'O');
  const unters = cnt(hand, (x) => rankOf(x) === 'U');
  const aces = cnt(hand, (x) => rankOf(x) === 'A');
  switch (bid.kind) {
    case 'sauspiel':
      return t <= 2 ? 0.05 : t === 3 ? (obers >= 2 ? 0.4 : 0.15) : t === 4 ? 0.8 : 1;
    case 'solo':
      return t <= 4 ? 0.03 : t === 5 ? (obers >= 2 ? 0.5 : 0.2) : 1;
    case 'wenz':
      return unters === 0 ? 0.01 : unters === 1 ? (aces >= 3 ? 0.25 : 0.05) : unters === 2 ? 0.6 : 1;
    case 'geier':
      return obers === 0 ? 0.01 : obers === 1 ? (aces >= 3 ? 0.25 : 0.05) : obers === 2 ? 0.6 : 1;
    case 'farbwenz':
    case 'farbgeier':
      return t <= 4 ? 0.03 : t === 5 ? 0.3 : 1;
    case 'bettel':
      return cnt(hand, (x) => rankOf(x) === 'A') > 0 ? 0.05 : cnt(hand, (x) => rankOf(x) === 'K') > 1 ? 0.2 : 1;
    default:
      return 1;
  }
}

/** Hätte diese Hand ein starkes Spiel gehabt? (Wer "weiter" sagt, hat es eher nicht.) */
function passLikelihood(hand: readonly CardId[]): number {
  const sau: Contract = { kind: 'sauspiel', suit: 'E' };
  const t = cnt(hand, (x) => isTrump(x, sau));
  const obers = cnt(hand, (x) => rankOf(x) === 'O');
  const unters = cnt(hand, (x) => rankOf(x) === 'U');
  let w = 1;
  if (t >= 6 && obers >= 2) w *= 0.3;
  else if (t >= 5 && callableSuits(hand).length) w *= 0.55;
  if (unters >= 3 && cnt(hand, (x) => rankOf(x) === 'A') >= 2) w *= 0.5;
  return w;
}

/** Gewicht einer Verteilung: Ansagen, Kontra und Hinweise aus dem Spielverlauf. */
function dealWeight(s: GameState, me: number, hands: CardId[][], init: CardId[][], partner: number | null): number {
  const c = s.contract!;
  let w = 1;
  for (const b of s.bids) {
    if (b.player === me) continue;
    w *= b.contract ? bidLikelihood(init[b.player], b.contract) : passLikelihood(init[b.player]);
  }
  // Kontra: der Gegenspieler hält sein Blatt für stark.
  const k = s.kontra ?? null;
  if (k !== null && k !== me && c.kind !== 'bettel') {
    const t = cnt(init[k], (x) => isTrump(x, c));
    w *= t >= 4 ? 1 : t === 3 ? 0.5 : 0.2;
  }
  // Sauspiel: wer zu wem hält, verrät sich im Spiel.
  if (c.kind === 'sauspiel' && partner !== null && s.partner === null) {
    const d = s.declarer!;
    const team = (p: number) => p === d || p === partner;
    for (const t of allTricks(s)) {
      const leader = t.leader;
      // Ein Gegenspieler spielt selten Trumpf an – der Partner schon.
      if (leader !== d && leader !== me && isTrump(t.cards[0], c)) w *= team(leader) ? 2.2 : 0.6;
      for (let i = 1; i < t.cards.length; i++) {
        const p = (leader + i) % 4;
        if (p === me) continue;
        const x = t.cards[i];
        const before = t.cards.slice(0, i);
        const winner = (leader + trickWinnerIndex(before, c)) % 4;
        const followed = effectiveSuit(x, c) === effectiveSuit(t.cards[0], c);
        // Geschmiert (viele Augen auf einen fremden Stich, ohne bedienen zu müssen).
        if (!followed && !isTrump(x, c) && pointsOf(x) >= 10) {
          if (beats(x, before[trickWinnerIndex(before, c)], t.cards[0], c)) continue;
          w *= team(p) === team(winner) ? 3 : 0.35;
        }
        // Über einen Stich gestochen, den sonst der eigene Partner hätte.
        if (!followed && isTrump(x, c) && beats(x, before[trickWinnerIndex(before, c)], t.cards[0], c)) {
          w *= team(p) === team(winner) ? 0.6 : 1.3;
        }
      }
    }
  }
  return w;
}

interface World {
  state: GameState;
  weight: number;
}

/** Gewichtete Stichprobe möglicher Welten (Verteilungen, die zum Wissen passen). */
function sampleWorlds(s: GameState, me: number, n: number, rng: Rng): World[] {
  const k = analyze(s, me);
  const c = s.contract!;
  const pool: World[] = [];
  const candidates = Math.max(n * 4, 40);
  for (let i = 0; i < candidates; i++) {
    const hands = sampleDeal(s, me, k, rng);
    if (!hands) continue;
    let partner = s.partner;
    if (c.kind === 'sauspiel' && partner === null) {
      const a = `${c.suit}A` as CardId;
      partner = hands.findIndex((h) => h.includes(a));
    }
    const init = initialHandsOf(s, hands);
    const weight = dealWeight(s, me, hands, init, partner);
    pool.push({ state: { ...s, hands, initialHands: init, partner }, weight });
  }
  if (!pool.length) return [];
  // Nach Gewicht neu ziehen (systematisch), damit unwahrscheinliche Welten selten vorkommen.
  const total = pool.reduce((a, w) => a + w.weight, 0);
  if (total <= 0) return pool.slice(0, n).map((w) => ({ ...w, weight: 1 }));
  const out: World[] = [];
  const step = total / n;
  let u = rng() * step;
  let acc = 0;
  for (const w of pool) {
    acc += w.weight;
    while (u < acc && out.length < n) {
      out.push({ state: w.state, weight: 1 });
      u += step;
    }
  }
  return out;
}

// =============================================================== Bewerten

/** Ergebnis aus Sicht von `me` (Cent) plus kleiner Augen-Anreiz als Gleichstandsbrecher. */
function utility(end: GameState, me: number): number {
  const r = end.result;
  if (!r || r.kind === 'zamgeworfen') return 0;
  if (r.kind === 'ramsch') return r.payouts[me] - 0.03 * r.points[me];
  const mine = r.declarerTeam.includes(me) ? r.declarerPoints : r.opponentPoints;
  return r.payouts[me] + 0.03 * mine;
}

/** Mit den schnellen Ausspielregeln zu Ende spielen. */
function rollout(s: GameState, me: number): number {
  let st = s;
  let guard = 0;
  while (st.phase === 'playing' && guard++ < 40) {
    st = applyAction(st, { type: 'play', player: st.turn, card: chooseNormalCard(st, st.turn, true) });
  }
  return utility(st, me);
}

// ---------------------------------------------------------------- exakte Endspiel-Suche

const DD_CARDS = 12;

function ddSupported(c: Contract): boolean {
  return !['bettel', 'ramsch'].includes(c.kind) && !isTout(c);
}

/**
 * Vollständige Suche (Alpha-Beta) bei offenen Karten in einer Welt.
 * Gibt den Wert jeder erlaubten Karte von `me` zurück.
 */
function ddValues(w: GameState, me: number, moves: CardId[]): number[] {
  const c = w.contract!;
  const d = w.declarer!;
  const team = w.partner === null ? [d] : [d, w.partner];
  const inTeam = PLAYERS.map((p) => team.includes(p));
  const myTeamDecl = inTeam[me];
  const won = w.tricks.filter((t) => team.includes(t.winner!));
  const basePts = sumPoints(won.flatMap((t) => t.cards));
  const baseTricks = won.length;
  const ace = c.kind === 'sauspiel' ? (`${c.suit}A` as CardId) : null;
  const played = playedCards(w);
  let gesucht = !ace || played.includes(ace) || w.tricks.some((t) => effectiveSuit(t.cards[0], c) === suitOf(ace!));
  const memo = new Map<number, number>();
  const leafValue = (pts: number, tr: number) => {
    const key = pts * 16 + tr;
    let v = memo.get(key);
    if (v === undefined) {
      const r = scoreGame({
        contract: c,
        declarer: d,
        partner: w.partner,
        declarerPoints: pts,
        declarerTricks: tr,
        initialHands: w.initialHands,
        tarif: w.tarif,
        kontra: (w.kontra ?? null) !== null,
        re: (w.re ?? null) !== null,
        bock: w.bock,
      });
      v = r.payouts[me] + 0.03 * (myTeamDecl ? pts : 120 - pts);
      memo.set(key, v);
    }
    return v;
  };
  const hands = w.hands.map((h) => [...h]);
  const power = (x: CardId) => (isTrump(x, c) ? 100 + trumpPower(x, c) : pointsOf(x));
  const legal = (p: number, trick: CardId[]): CardId[] => {
    const h = hands[p];
    const holds = ace !== null && !gesucht && h.includes(ace);
    if (trick.length === 0) {
      if (!holds) return h;
      const suitCards = h.filter((x) => effectiveSuit(x, c) === suitOf(ace!));
      if (suitCards.length >= 4) return h;
      return h.filter((x) => effectiveSuit(x, c) !== suitOf(ace!) || x === ace);
    }
    const led = effectiveSuit(trick[0], c);
    const follow = h.filter((x) => effectiveSuit(x, c) === led);
    if (follow.length) return holds && led === suitOf(ace!) ? [ace!] : follow;
    if (holds && h.length > 1) return h.filter((x) => x !== ace);
    return h;
  };
  const search = (leader: number, trick: CardId[], pts: number, tr: number, alpha: number, beta: number): number => {
    if (trick.length === 4) {
      const wi = trickWinnerIndex(trick, c);
      const winner = (leader + wi) % 4;
      const tp = sumPoints(trick);
      const np = inTeam[winner] ? pts + tp : pts;
      const nt = inTeam[winner] ? tr + 1 : tr;
      if (hands[winner].length === 0) return leafValue(np, nt);
      return search(winner, [], np, nt, alpha, beta);
    }
    const p = (leader + trick.length) % 4;
    const maximize = inTeam[p] === myTeamDecl;
    const opts = [...legal(p, trick)].sort((a, b) => power(b) - power(a));
    let best = maximize ? -Infinity : Infinity;
    const prevGesucht = gesucht;
    for (const x of opts) {
      const h = hands[p];
      const idx = h.indexOf(x);
      h.splice(idx, 1);
      if (ace && (x === ace || (trick.length === 0 && effectiveSuit(x, c) === suitOf(ace)))) gesucht = true;
      const v = search(leader, [...trick, x], pts, tr, alpha, beta);
      gesucht = prevGesucht;
      h.splice(idx, 0, x);
      if (maximize) {
        if (v > best) best = v;
        if (best > alpha) alpha = best;
      } else {
        if (v < best) best = v;
        if (best < beta) beta = best;
      }
      if (alpha >= beta) break;
    }
    return best;
  };
  const cur = w.current!;
  return moves.map((x) => {
    const h = hands[me];
    const idx = h.indexOf(x);
    h.splice(idx, 1);
    const prev = gesucht;
    if (ace && (x === ace || (cur.cards.length === 0 && effectiveSuit(x, c) === suitOf(ace)))) gesucht = true;
    const v = search(cur.leader, [...cur.cards, x], basePts, baseTricks, -Infinity, Infinity);
    gesucht = prev;
    h.splice(idx, 0, x);
    return v;
  });
}

function remainingCards(s: GameState): number {
  return s.hands.reduce((a, h) => a + h.length, 0);
}

/** Wert jeder Karte in einer Welt. */
function evaluateMoves(w: GameState, me: number, moves: CardId[], exact = DD_CARDS): number[] {
  if (ddSupported(w.contract!) && remainingCards(w) <= exact) return ddValues(w, me, moves);
  return moves.map((x) => {
    const st = applyAction(w, { type: 'play', player: me, card: x });
    return st.phase === 'finished' ? utility(st, me) : rollout(st, me);
  });
}

// =============================================================== Karte wählen

export function chooseStrongCard(s: GameState, me: number, rng: Rng = Math.random, opts: StrongOptions = {}): CardId {
  const legal = legalCards(s, me);
  if (legal.length === 1) return legal[0];
  const fallback = chooseNormalCard(s, me);
  const budget = opts.timeMs ?? 450;
  const target = opts.samples ?? 48;
  const start = now();
  const totals = legal.map(() => 0);
  let used = 0;
  // In Paketen ziehen, bis Zeit oder Anzahl erreicht ist.
  while (used < target) {
    const batch = sampleWorlds(s, me, Math.min(12, target - used), rng);
    if (!batch.length) break;
    for (const w of batch) {
      const vals = evaluateMoves(w.state, me, legal, opts.exactCards);
      vals.forEach((v, i) => (totals[i] += v));
      used++;
    }
    if (opts.samples === undefined && now() - start > budget) break;
  }
  if (!used) return fallback;
  // Kleiner Vorschuss für die Karte der Grundregeln: dämpft Zufallsrauschen der Stichprobe.
  const prior = 1.5;
  const avg = totals.map((t, i) => t / used + (legal[i] === fallback ? prior : 0) + stabBonus(s, me, legal[i]));
  opts.onScores?.(legal, avg);
  // Gleichstand: lieber die Karte der Grundregeln, sonst die billigere.
  // Liegt die Gegenpartei mit einem fetten Stich vorn und man kann ihn holen, wird gestochen.
  const allowed = legal.map((x) => !mustStab(s, me, legal) || stabBonus(s, me, x) > 0);
  let best = allowed.indexOf(true);
  for (let i = 0; i < legal.length; i++) {
    if (!allowed[i] || i === best) continue;
    const better = avg[i] > avg[best] + 1e-6;
    const tie = Math.abs(avg[i] - avg[best]) <= 1e-6;
    if (better || (tie && (legal[i] === fallback || (legal[best] !== fallback && cardCost(legal[i], s.contract!) < cardCost(legal[best], s.contract!))))) best = i;
  }
  return legal[best];
}

/**
 * Liegt sicher die Gegenpartei vorn (z.B. der Spieler hat eine Farbe aufgespielt)
 * und man kann den Stich holen, bekommt das Stechen einen Vorschuss – nicht stechen
 * muss sich in der Rechnung deutlich lohnen.
 */
function stabBonus(s: GameState, me: number, x: CardId): number {
  const c = s.contract!;
  const t = s.current!;
  if (!t.cards.length || c.kind === 'bettel' || c.kind === 'ramsch') return 0;
  const winner = (t.leader + trickWinnerIndex(t.cards, c)) % 4;
  if (!knownEnemies(s, me).includes(winner)) return 0;
  if (trickWinnerIndex([...t.cards, x], c) !== t.cards.length) return 0;
  const pts = sumPoints(t.cards);
  // In Cent, passend zum Spielwert (Kontra, Re und Bock verdoppeln ihn).
  const tarif = s.tarif ?? DEFAULT_TARIF;
  const stake =
    (isSoloLike(c) ? tarif.solo : tarif.sauspiel) *
    ((s.kontra ?? null) !== null ? 2 : 1) *
    ((s.re ?? null) !== null ? 2 : 1) *
    (s.bock ?? 1);
  return stake * (pts >= 10 ? 0.3 : pts >= 4 ? 0.15 : 0);
}

/** Fetter Stich (ab 10 Augen) der sicheren Gegenpartei, den man holen kann? */
function mustStab(s: GameState, me: number, legal: CardId[]): boolean {
  const t = s.current!;
  return t.cards.length > 0 && sumPoints(t.cards) >= 10 && legal.some((x) => stabBonus(s, me, x) > 0);
}

function cardCost(x: CardId, c: Contract): number {
  return pointsOf(x) + (isTrump(x, c) ? 6 + trumpPower(x, c) : 0);
}

/** Erwartung aus Sicht von `me` im jetzigen Stand (für Kontra/Re). */
function estimate(s: GameState, me: number, rng: Rng, opts: StrongOptions): { ev: number; winProb: number } {
  const n = opts.samples ?? 40;
  const worlds = sampleWorlds(s, me, n, rng);
  if (!worlds.length) return { ev: 0, winProb: 0 };
  let ev = 0;
  let wins = 0;
  for (const w of worlds) {
    let st = w.state;
    let guard = 0;
    while (st.phase === 'playing' && guard++ < 40) {
      st = applyAction(st, { type: 'play', player: st.turn, card: chooseNormalCard(st, st.turn, true) });
    }
    const u = utility(st, me);
    ev += u;
    if (st.result && st.result.kind !== 'zamgeworfen' && st.result.payouts[me] > 0) wins++;
  }
  return { ev: ev / worlds.length, winProb: wins / worlds.length };
}

// =============================================================== Reizen

/** Kommt diese Ansage mit der Hand überhaupt in Frage? (grobe Vorauswahl) */
function plausible(hand: readonly CardId[], c: Contract): boolean {
  const t = cnt(hand, (x) => isTrump(x, c));
  const obers = cnt(hand, (x) => rankOf(x) === 'O');
  const unters = cnt(hand, (x) => rankOf(x) === 'U');
  const aces = cnt(hand, (x) => rankOf(x) === 'A');
  switch (c.kind) {
    case 'sauspiel':
      return t >= 3;
    case 'hochzeit':
      return aces >= 1;
    case 'solo':
      return t >= (isTout(c) ? 7 : 5) && obers + unters >= 2;
    case 'wenz':
      return isTout(c) ? unters >= 3 : unters >= 2 || (unters === 1 && aces >= 3);
    case 'geier':
      return isTout(c) ? obers >= 3 : obers >= 2 || (obers === 1 && aces >= 3);
    case 'farbwenz':
    case 'farbgeier':
      return t >= (isTout(c) ? 7 : 5);
    case 'bettel':
      return aces === 0 && cnt(hand, (x) => rankOf(x) === 'K') <= 1 && cnt(hand, (x) => rankOf(x) === 'O') <= 1;
    case 'sie':
      return true;
    default:
      return false;
  }
}

/** Mit welcher Ansage ist der erwartete Gewinn am größten? Simulation vieler Verteilungen. */
export function chooseStrongBid(s: GameState, me: number, rng: Rng = Math.random, opts: StrongOptions = {}): Contract | null {
  const all = legalBids(s, me);
  const canPass = all.includes(null);
  const hand = s.hands[me];
  const legal = all.filter((b): b is Contract => b !== null);
  const sie = legal.find((b) => b.kind === 'sie');
  if (sie) return sie;
  const cands = legal.filter((b) => plausible(hand, b));
  if (!cands.length) return canPass ? null : chooseBid(s, me);
  const n = opts.samples ?? 36;
  // Dieselben Verteilungen für alle Kandidaten (fairer Vergleich).
  const deals: CardId[][][] = [];
  const rest = ALL.filter((x) => !hand.includes(x));
  for (let i = 0; i < n; i++) {
    const sh = shuffle(rest, rng);
    const hands: CardId[][] = [];
    let k = 0;
    for (const p of PLAYERS) {
      if (p === me) hands.push([...hand]);
      else {
        hands.push(sh.slice(k, k + 8));
        k += 8;
      }
    }
    deals.push(hands);
  }
  // Ansagen der Vorderen berücksichtigen: Verteilungen gewichten.
  const weights = deals.map((h) => {
    let w = 1;
    for (const b of s.bids) w *= b.contract ? bidLikelihood(h[b.player], b.contract) : passLikelihood(h[b.player]);
    return w;
  });
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  let best: Contract | null = null;
  let bestEv = -Infinity;
  const bettelCache: (boolean | undefined)[] = [];
  for (const c of cands) {
    let ev = 0;
    deals.forEach((hands, i) => {
      if (!weights[i]) return;
      let st = playFrom(s, me, c, hands);
      if (c.kind === 'bettel') {
        // Bettel exakt prüfen: Können die Gegner bei offenen Karten einen Stich erzwingen?
        const forced = (bettelCache[i] ??= bettelForced(hands, me, next(s.dealer), c));
        const r = scoreGame({ contract: c, declarer: me, partner: null, declarerPoints: 0, declarerTricks: forced ? 1 : 0, initialHands: hands, tarif: s.tarif, bock: s.bock });
        ev += weights[i] * r.payouts[me];
        return;
      }
      let guard = 0;
      while (st.phase === 'playing' && guard++ < 40) {
        st = applyAction(st, { type: 'play', player: st.turn, card: chooseNormalCard(st, st.turn, true) });
      }
      const r = st.result;
      ev += weights[i] * (r && r.kind !== 'zamgeworfen' ? r.payouts[me] : 0);
    });
    ev /= wsum;
    if (c.kind === 'bettel') {
      // Menschen verteidigen einen Bettel oft geschickter als jede Rechnung: nur mit
      // klar sicherem Blatt (etwa drei von vier Verteilungen gewonnen) ansagen.
      const full = (s.tarif ?? DEFAULT_TARIF).solo * (c.brett ? 2 : 1) * 3 * (s.bock ?? 1);
      ev -= 0.5 * full;
    }
    if (ev > bestEv) {
      bestEv = ev;
      best = c;
    }
  }
  // Etwas Sicherheitsabstand: lieber ein klares Spiel als ein Glücksspiel.
  const margin = best && best.kind === 'sauspiel' ? 1.5 : 6;
  if (canPass && (best === null || bestEv < margin)) return null;
  return best;
}

/**
 * Bettel bei offenen Karten: Können die Gegner den Spieler zu einem Stich zwingen?
 * Jede Farbe wird für sich exakt durchgerechnet (die Gegner kommen immer wieder
 * zum Ausspielen, weil der Spieler ja nie sticht). Dass der Spieler in einer
 * Fehlfarbe auch hohe Karten abwerfen kann, wird nicht mitgerechnet – das macht
 * die Einschätzung eher vorsichtig.
 */
export function bettelForced(hands: CardId[][], declarer: number, _leader: number, c: Contract): boolean {
  const pw = (x: CardId) => suitPower(x, c);
  for (const su of ['E', 'G', 'H', 'S'] as Suit[]) {
    const per = hands.map((h) => h.filter((x) => suitOf(x) === su).map(pw).sort((a, b) => a - b));
    if (!per[declarer].length) continue;
    if (suitForced(per, declarer, new Map())) return true;
  }
  return false;
}

/** Eine Farbe: Gegner wählen, wer ausspielt; alle bedienen der Reihe nach. */
function suitForced(per: number[][], d: number, memo: Map<string, boolean>): boolean {
  if (!per[d].length) return false;
  const key = per.map((x) => x.join(',')).join('|');
  const m = memo.get(key);
  if (m !== undefined) return m;
  let res = false;
  for (let lead = 0; lead < 4 && !res; lead++) {
    if (lead === d || !per[lead].length) continue;
    res = round(per, d, lead, 0, -1, -1, memo);
  }
  memo.set(key, res);
  return res;
}

/** Stich in einer Farbe Spieler für Spieler; best = höchste Karte, bestBy = wer sie hat. */
function round(per: number[][], d: number, lead: number, i: number, best: number, bestBy: number, memo: Map<string, boolean>): boolean {
  if (i === 4) {
    if (bestBy === d) return true;
    return suitForced(per, d, memo);
  }
  const p = (lead + i) % 4;
  const cards = per[p];
  if (!cards.length) return round(per, d, lead, i + 1, best, bestBy, memo); // abwerfen
  const isDecl = p === d;
  const opts = [...new Set(cards)];
  const order = isDecl ? [...opts].reverse() : opts;
  for (const x of order) {
    const idx = cards.indexOf(x);
    cards.splice(idx, 1);
    const v = x > best ? round(per, d, lead, i + 1, x, p, memo) : round(per, d, lead, i + 1, best, bestBy, memo);
    cards.splice(idx, 0, x);
    if (isDecl && !v) return false;
    if (!isDecl && v) return true;
  }
  return !isDecl ? false : true;
}

/** Spielstand direkt nach dem Reizen mit Ansage `c` von `me` und den Händen `hands`. */
function playFrom(s: GameState, me: number, c: Contract, hands: CardId[][]): GameState {
  let partner: number | null = null;
  if (c.kind === 'sauspiel') partner = hands.findIndex((h) => h.includes(`${c.suit}A` as CardId));
  if (c.kind === 'hochzeit') {
    // Grob: ein zufälliger Mitspieler nimmt an.
    partner = next(me);
  }
  const contract: Contract = c.kind === 'hochzeit' ? { kind: 'sauspiel', suit: 'E' } : c;
  const base = newGame(s.dealer, createRng(1), { rules: s.rules, tarif: s.tarif, bock: s.bock });
  const lead = next(s.dealer);
  return {
    ...base,
    hands: hands.map((h) => [...h]),
    initialHands: hands.map((h) => [...h]),
    phase: 'playing',
    contract: c.kind === 'hochzeit' ? { kind: 'hochzeit' } : contract,
    declarer: me,
    partner,
    turn: lead,
    current: { leader: lead, cards: [] },
  };
}

// =============================================================== Schwierigkeit

export type BotLevel = 'normal' | 'strong';

/** Zug eines Computergegners in der gewählten Schwierigkeit. */
export function chooseBotAction(s: GameState, player: number, level: BotLevel = 'normal', opts?: StrongOptions): Action {
  return level === 'strong' ? chooseStrongAction(s, player, opts) : chooseNormal(s, player);
}

