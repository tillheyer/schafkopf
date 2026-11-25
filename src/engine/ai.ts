import { CardId, pointsOf, rankOf, suitOf, sumPoints, Suit } from './cards';
import { Contract, contractRank, effectiveSuit, isTrump, trickWinnerIndex, trumpPower } from './rules';
import { Action, GameState, callableSuits, calledAcePlayed, highestBid, legalBids, legalCards, sauGesucht } from './game';

/**
 * Einfache regelbasierte Computergegner. Sie nutzen nur Wissen, das ein echter
 * Spieler auch hätte: eigene Hand, gespielte Karten, Ansagen.
 */
export function chooseAction(s: GameState, player: number): Action {
  if (s.phase === 'bidding') return { type: 'bid', player, contract: chooseBid(s, player) };
  return { type: 'play', player, card: chooseCard(s, player) };
}

// ---------------------------------------------------------------- Reizen

const count = (hand: readonly CardId[], f: (c: CardId) => boolean) => hand.filter(f).length;

function soloStrength(hand: readonly CardId[], suit: Suit): boolean {
  const c: Contract = { kind: 'solo', suit };
  const trumps = count(hand, (x) => isTrump(x, c));
  const ou = count(hand, (x) => rankOf(x) === 'O' || rankOf(x) === 'U');
  const obers = count(hand, (x) => rankOf(x) === 'O');
  const sideAces = count(hand, (x) => rankOf(x) === 'A' && suitOf(x) !== suit);
  return (
    (trumps >= 7 && ou >= 3) ||
    (trumps >= 6 && ou >= 4 && obers >= 2) ||
    (trumps >= 6 && obers >= 3 && sideAces >= 1)
  );
}

function wenzStrength(hand: readonly CardId[]): boolean {
  const unters = count(hand, (x) => rankOf(x) === 'U');
  const aces = count(hand, (x) => rankOf(x) === 'A');
  const tensWithAce = count(hand, (x) => rankOf(x) === '10' && hand.includes(`${suitOf(x)}A` as CardId));
  const score = unters * 2 + aces * 1.5 + tensWithAce * 0.5;
  return (unters >= 3 && score >= 8) || (unters >= 2 && hand.includes('EU') && score >= 9.5);
}

function sauspielStrength(hand: readonly CardId[]): boolean {
  const c: Contract = { kind: 'sauspiel', suit: 'E' };
  const trumps = count(hand, (x) => isTrump(x, c));
  const obers = count(hand, (x) => rankOf(x) === 'O');
  return trumps >= 5 || (trumps >= 4 && obers >= 2);
}

export function chooseBid(s: GameState, player: number): Contract | null {
  const hand = s.hands[player];
  const legal = legalBids(s, player);
  const min = highestBid(s) ? contractRank(highestBid(s)!.contract!) + 1 : 1;

  if (min <= 3) {
    const suits = (['E', 'G', 'H', 'S'] as Suit[]).filter((su) => soloStrength(hand, su));
    if (suits.length) {
      // Farbe mit den meisten Trümpfen.
      suits.sort(
        (a, b) =>
          count(hand, (x) => isTrump(x, { kind: 'solo', suit: b })) -
          count(hand, (x) => isTrump(x, { kind: 'solo', suit: a })),
      );
      return { kind: 'solo', suit: suits[0] };
    }
  }
  if (min <= 2 && wenzStrength(hand)) return { kind: 'wenz' };
  if (min <= 1 && sauspielStrength(hand)) {
    const callable = callableSuits(hand);
    if (callable.length) {
      // Am liebsten auf eine Farbe rufen, von der man wenig hat.
      callable.sort((a, b) => sideCount(hand, a) - sideCount(hand, b));
      return { kind: 'sauspiel', suit: callable[0] };
    }
  }
  return legal.includes(null) ? null : legal[0];
}

const sideCount = (hand: readonly CardId[], suit: Suit) =>
  count(hand, (x) => suitOf(x) === suit && rankOf(x) !== 'O' && rankOf(x) !== 'U');

// ---------------------------------------------------------------- Spielen

/** Wen kennt `me` sicher als Mitspieler? */
export function knownTeammates(s: GameState, me: number): number[] {
  const d = s.declarer!;
  const c = s.contract!;
  if (c.kind !== 'sauspiel') {
    return me === d ? [] : [0, 1, 2, 3].filter((p) => p !== d && p !== me);
  }
  const p = s.partner!;
  if (calledAcePlayed(s)) {
    const team = me === d || me === p ? [d, p] : [0, 1, 2, 3].filter((x) => x !== d && x !== p);
    return team.filter((x) => x !== me);
  }
  if (me === p) return [d];
  return [];
}

/** "Kosten" einer Karte: wie ungern man sie hergibt. */
function cost(card: CardId, c: Contract): number {
  const t = trumpPower(card, c);
  return pointsOf(card) + (t >= 0 ? 6 + t : 0);
}

export function chooseCard(s: GameState, me: number): CardId {
  const c = s.contract!;
  const legal = legalCards(s, me);
  if (legal.length === 1) return legal[0];
  const trick = s.current!;
  const mates = knownTeammates(s, me);
  const onDeclarerSide = me === s.declarer || (me === s.partner && c.kind === 'sauspiel');
  const byCost = [...legal].sort((a, b) => cost(a, c) - cost(b, c));

  // ---------- Ausspielen
  if (trick.cards.length === 0) {
    const trumps = legal.filter((x) => isTrump(x, c)).sort((a, b) => trumpPower(b, c) - trumpPower(a, c));
    const played = s.tricks.flatMap((t) => t.cards);
    const ledSuits = new Set(s.tricks.map((t) => effectiveSuit(t.cards[0], c)));
    if (onDeclarerSide && trumps.length >= 3) return trumps[0];
    // Gegenspieler im Sauspiel: gerufene Farbe anspielen, um die Sau zu suchen.
    if (!onDeclarerSide && c.kind === 'sauspiel' && !sauGesucht(s)) {
      const search = legal.filter((x) => effectiveSuit(x, c) === c.suit).sort((a, b) => pointsOf(a) - pointsOf(b));
      if (search.length) return search[0];
    }
    const aces = legal.filter((x) => !isTrump(x, c) && rankOf(x) === 'A' && !ledSuits.has(suitOf(x)));
    if (aces.length) return aces[0];
    if (onDeclarerSide && trumps.length) return trumps[0];
    const nonTrumps = byCost.filter((x) => !isTrump(x, c) && !played.includes(x));
    return nonTrumps[0] ?? byCost[0];
  }

  // ---------- Zugeben
  const winIdx = trickWinnerIndex(trick.cards, c);
  const winner = (trick.leader + winIdx) % 4;
  const isLast = trick.cards.length === 3;
  const trickPts = sumPoints(trick.cards);
  const winningCard = trick.cards[winIdx];
  const mateWinning = mates.includes(winner);
  const strongWin = trumpPower(winningCard, c) >= 17 || isLast;

  if (mateWinning && strongWin) {
    // Schmieren: viele Augen, aber keine hohen Trümpfe.
    const smear = [...legal].sort((a, b) => smearValue(b, c) - smearValue(a, c));
    return smear[0];
  }
  const winners = legal.filter((x) => trickWinnerIndex([...trick.cards, x], c) === trick.cards.length);
  if (winners.length && !mateWinning) {
    const cheapest = [...winners].sort((a, b) => cost(a, c) - cost(b, c))[0];
    if (isLast || trickPts >= 10 || cost(cheapest, c) < 12) return cheapest;
  }
  return byCost[0];
}

function smearValue(card: CardId, c: Contract): number {
  const t = trumpPower(card, c);
  return t >= 0 ? pointsOf(card) - 8 - t : pointsOf(card);
}
