import { CardId, pointsOf, rankOf, suitOf, sumPoints, Suit } from './cards';
import { trumpOrder } from './rules';
import { Contract, contractRank, effectiveSuit, isTrump, sameContract, suitPower, trickWinnerIndex, trumpPower } from './rules';
import { Action, GameState, callableSuits, calledAcePlayed, canKontra, canRe, highestBid, legalBids, legalCards, sauGesucht } from './game';

/**
 * Einfache regelbasierte Computergegner. Sie nutzen nur Wissen, das ein echter
 * Spieler auch hätte: eigene Hand, gespielte Karten, Ansagen.
 */
export function chooseAction(s: GameState, player: number): Action {
  if (s.phase === 'bidding') return { type: 'bid', player, contract: chooseBid(s, player) };
  if (s.phase === 'hochzeit') return chooseHochzeit(s, player);
  if (canKontra(s, player) && wantsKontra(s, player)) return { type: 'kontra', player };
  if (canRe(s, player) && wantsRe(s, player)) return { type: 're', player };
  return { type: 'play', player, card: chooseCard(s, player) };
}

// ---------------------------------------------------------------- Kontra und Re

/** Hochzeit annehmen, wenn man selbst viele Trümpfe hat; die schwächste Fehlkarte abgeben. */
function chooseHochzeit(s: GameState, player: number): Action {
  const hand = s.hands[player];
  const c: Contract = { kind: 'sauspiel', suit: 'E' };
  const trumps = count(hand, (x) => isTrump(x, c));
  const obers = count(hand, (x) => rankOf(x) === 'O');
  if (trumps >= 5 || (trumps >= 4 && obers >= 2)) {
    const side = hand.filter((x) => !isTrump(x, c)).sort((a, b) => pointsOf(a) - pointsOf(b) || suitPower(a, c) - suitPower(b, c));
    const give = side[0] ?? [...hand].sort((a, b) => trumpPower(a, c) - trumpPower(b, c))[0];
    return { type: 'hochzeit', player, accept: true, give };
  }
  return { type: 'hochzeit', player, accept: false };
}

function handStats(s: GameState, player: number) {
  const c = s.contract!;
  const hand = s.initialHands[player].length ? s.initialHands[player] : s.hands[player];
  return {
    trumps: hand.filter((x) => isTrump(x, c)).length,
    obers: hand.filter((x) => rankOf(x) === 'O').length,
    unters: hand.filter((x) => rankOf(x) === 'U').length,
    aces: hand.filter((x) => rankOf(x) === 'A' && !isTrump(x, c)).length,
  };
}

/** Gegenspieler mit sehr gutem Blatt geben Kontra. */
export function wantsKontra(s: GameState, player: number): boolean {
  const k = s.contract!.kind;
  const h = handStats(s, player);
  if (k === 'sauspiel') return (h.trumps >= 5 && h.obers >= 2) || h.trumps >= 6;
  if (k === 'wenz') return h.unters >= 2 && h.aces >= 3;
  if (k === 'geier') return h.obers >= 2 && h.aces >= 3;
  if (k === 'bettel' || k === 'hochzeit') return false;
  return h.trumps >= 4 && h.obers >= 3;
}

/** Die Spielerpartei antwortet mit Re, wenn sie sich sehr sicher ist. */
export function wantsRe(s: GameState, player: number): boolean {
  const k = s.contract!.kind;
  const h = handStats(s, player);
  if (k === 'sauspiel') return h.trumps >= 6 || (h.trumps >= 5 && h.obers >= 3);
  if (k === 'wenz') return h.unters >= 3 && h.aces >= 3;
  if (k === 'geier') return h.obers >= 3 && h.aces >= 3;
  if (k === 'bettel' || k === 'hochzeit') return false;
  return h.trumps >= 7;
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

/** Geier wie Wenz, nur mit den Obern. */
function geierStrength(hand: readonly CardId[]): boolean {
  const obers = count(hand, (x) => rankOf(x) === 'O');
  const aces = count(hand, (x) => rankOf(x) === 'A');
  const score = obers * 2 + aces * 1.5;
  return (obers >= 3 && score >= 8) || (obers >= 2 && hand.includes('EO') && score >= 9.5);
}

/** Farbwenz/Farbgeier: viele Trümpfe mit mindestens zwei Bildern. */
function farbStrength(hand: readonly CardId[], c: Contract): boolean {
  const trumps = count(hand, (x) => isTrump(x, c));
  const tops = count(hand, (x) => isTrump(x, c) && trumpPower(x, c) >= 17);
  return (trumps >= 7 && tops >= 2) || (trumps >= 6 && tops >= 3);
}

/** Bettel: keine hohen Karten und in jeder Farbe eine ganz kleine. */
function bettelStrength(hand: readonly CardId[]): boolean {
  if (hand.some((x) => rankOf(x) === 'A' || rankOf(x) === 'K')) return false;
  if (count(hand, (x) => rankOf(x) === 'O') > 1) return false;
  return (['E', 'G', 'H', 'S'] as Suit[]).every((su) => {
    const cards = hand.filter((x) => suitOf(x) === su);
    return cards.length === 0 || cards.some((x) => rankOf(x) === '7' || rankOf(x) === '8');
  });
}

/** Tout: so stark, dass man alle Stiche erwartet. */
function toutStrength(hand: readonly CardId[], c: Contract): boolean {
  const trumps = count(hand, (x) => isTrump(x, c));
  const top = trumpOrder(c).slice(0, 3).every((x) => hand.includes(x));
  const sideOk = hand.filter((x) => !isTrump(x, c)).every((x) => rankOf(x) === 'A');
  return (trumps >= 7 && top) || (trumps >= 5 && top && sideOk);
}

export function chooseBid(s: GameState, player: number): Contract | null {
  const hand = s.hands[player];
  const legal = legalBids(s, player).filter((b): b is Contract => b !== null);
  const can = (c: Contract) => legal.some((b) => sameContract(b, c));
  const pick = (c: Contract) => (can(c) ? c : null);

  const sie = pick({ kind: 'sie' });
  if (sie) return sie;

  // Kandidaten von hoch nach niedrig prüfen.
  const solos = (['E', 'G', 'H', 'S'] as Suit[])
    .filter((su) => soloStrength(hand, su))
    .sort((a, b) => count(hand, (x) => isTrump(x, { kind: 'solo', suit: b })) - count(hand, (x) => isTrump(x, { kind: 'solo', suit: a })));
  for (const su of solos) {
    const t = pick({ kind: 'solo', suit: su, tout: true });
    if (t && toutStrength(hand, t)) return t;
  }
  if (wenzStrength(hand)) {
    const t = pick({ kind: 'wenz', tout: true });
    if (t && toutStrength(hand, t)) return t;
  }
  if (bettelStrength(hand)) {
    const b = pick({ kind: 'bettel', brett: true });
    if (b && count(hand, (x) => rankOf(x) === '7') >= 3) return b;
  }
  for (const su of solos) {
    const c = pick({ kind: 'solo', suit: su });
    if (c) return c;
  }
  if (wenzStrength(hand) && can({ kind: 'wenz' })) return { kind: 'wenz' };
  if (geierStrength(hand) && can({ kind: 'geier' })) return { kind: 'geier' };
  for (const kind of ['farbwenz', 'farbgeier'] as const) {
    for (const su of ['E', 'G', 'H', 'S'] as Suit[]) {
      const c = pick({ kind, suit: su });
      if (c && farbStrength(hand, c)) return c;
    }
  }
  if (bettelStrength(hand) && can({ kind: 'bettel' })) return { kind: 'bettel' };
  if (sauspielStrength(hand)) {
    const callable = callableSuits(hand).filter((su) => can({ kind: 'sauspiel', suit: su }));
    if (callable.length) {
      // Am liebsten auf eine Farbe rufen, von der man wenig hat.
      callable.sort((a, b) => sideCount(hand, a) - sideCount(hand, b));
      return { kind: 'sauspiel', suit: callable[0] };
    }
  }
  const h = pick({ kind: 'hochzeit' });
  if (h && count(hand, (x) => rankOf(x) === 'A') >= 2) return h;
  if (legalBids(s, player).includes(null)) return null;
  // Muss-Spiel: irgendein Spiel ansagen, am liebsten ein Sauspiel.
  return legal.find((b) => b.kind === 'sauspiel') ?? legal.find((b) => b.kind === 'hochzeit') ?? legal.find((b) => b.kind === 'wenz') ?? legal[0];
}

const sideCount = (hand: readonly CardId[], suit: Suit) =>
  count(hand, (x) => suitOf(x) === suit && rankOf(x) !== 'O' && rankOf(x) !== 'U');

// ---------------------------------------------------------------- Spielen

/** Wen kennt `me` sicher als Mitspieler? */
export function knownTeammates(s: GameState, me: number): number[] {
  const d = s.declarer!;
  const c = s.contract!;
  if (c.kind === 'ramsch') return [];
  if (c.kind === 'hochzeit') {
    const team = [d, s.partner!];
    return (team.includes(me) ? team : [0, 1, 2, 3].filter((x) => !team.includes(x))).filter((x) => x !== me);
  }
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

/** Wen kennt `me` sicher als Gegner? */
export function knownEnemies(s: GameState, me: number): number[] {
  const c = s.contract!;
  if (c.kind === 'ramsch') return [0, 1, 2, 3].filter((x) => x !== me);
  const mates = knownTeammates(s, me);
  const d = s.declarer!;
  const onDeclarerSide = me === d || (me === s.partner && (c.kind === 'sauspiel' || c.kind === 'hochzeit'));
  const teamKnown = c.kind !== 'sauspiel' || calledAcePlayed(s) || me === s.partner;
  if (teamKnown) return [0, 1, 2, 3].filter((x) => x !== me && !mates.includes(x));
  // Sauspiel, Partner noch unbekannt: als Gegenspieler ist nur der Spieler sicher ein Gegner.
  return onDeclarerSide ? [] : [d];
}

/** "Kosten" einer Karte: wie ungern man sie hergibt. */
function cost(card: CardId, c: Contract): number {
  const t = trumpPower(card, c);
  return pointsOf(card) + (t >= 0 ? 6 + t : 0);
}

/**
 * `smart`: kleine Verbesserungen, die der starke Computer in seinen Simulationen
 * verwendet (der normale Computer bleibt, wie er ist).
 */
export function chooseCard(s: GameState, me: number, smart = false): CardId {
  const c = s.contract!;
  const legal = legalCards(s, me);
  if (legal.length === 1) return legal[0];
  if (c.kind === 'bettel') return smart && me !== s.declarer ? bettelDefense(s, me, legal) : bettelCard(s, me, legal);
  if (c.kind === 'ramsch') return ramschCard(s, me, legal);
  const trick = s.current!;
  const mates = knownTeammates(s, me);
  const onDeclarerSide = me === s.declarer || (me === s.partner && (c.kind === 'sauspiel' || c.kind === 'hochzeit'));
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
      // Klug: nicht mit der Zehn suchen, die fiele sonst der Sau zum Opfer.
      if (search.length && !(smart && pointsOf(search[0]) >= 10)) return search[0];
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
    // Liegt sicher die Gegenpartei vorn (z.B. der Spieler hat eine Farbe aufgespielt),
    // wird gestochen: mit kleinem Trumpf immer, mit einem Ober erst ab ein paar Augen.
    if (knownEnemies(s, me).includes(winner) && (trumpPower(cheapest, c) < 17 || trickPts >= 4)) return cheapest;
  }
  return byCost[0];
}

function smearValue(card: CardId, c: Contract): number {
  const t = trumpPower(card, c);
  return t >= 0 ? pointsOf(card) - 8 - t : pointsOf(card);
}

/**
 * Klügere Bettel-Abwehr (für die Simulationen des starken Computers): den Spieler
 * gezielt in Farben zwingen, in denen er nur hohe Karten hat, und selbst nie
 * über ihm bleiben. Die Hand des Spielers ist beim Brett offen; sonst kennt der
 * Simulator sie aus der gezogenen Verteilung (eher vorsichtige Einschätzung).
 */
function bettelDefense(s: GameState, me: number, legal: CardId[]): CardId {
  const c = s.contract!;
  const d = s.declarer!;
  const pw = (x: CardId) => suitPower(x, c);
  const asc = [...legal].sort((a, b) => pw(a) - pw(b));
  const dHand = s.hands[d].filter((x) => x !== ('??' as CardId));
  const trick = s.current!;
  if (trick.cards.length === 0) {
    // Farbe suchen, in der unsere kleinste Karte unter allen Karten des Spielers liegt.
    let best: CardId | null = null;
    let bestGap = -Infinity;
    for (const x of asc) {
      const theirs = dHand.filter((y) => suitOf(y) === suitOf(x));
      if (!theirs.length) continue;
      const low = Math.min(...theirs.map(pw));
      const gap = low - pw(x);
      if (gap > bestGap) {
        bestGap = gap;
        best = x;
      }
    }
    return best ?? asc[0];
  }
  const ledSuit = suitOf(trick.cards[0]);
  const following = suitOf(legal[0]) === ledSuit && legal.every((x) => suitOf(x) === ledSuit);
  const dPos = (d - trick.leader + 4) % 4;
  const dPlayed = dPos < trick.cards.length;
  const winIdx = trickWinnerIndex(trick.cards, c);
  if (!following) {
    // Abwerfen: die höchste Karte loswerden (kleine behält man zum Zwingen).
    return asc[asc.length - 1];
  }
  if (dPlayed) {
    if (winIdx === dPos) {
      // Der Spieler liegt vorn: drunter bleiben, so hoch wie möglich.
      const under = asc.filter((x) => trickWinnerIndex([...trick.cards, x], c) !== trick.cards.length);
      return under.length ? under[under.length - 1] : asc[asc.length - 1];
    }
    // Ein Mitspieler hat den Stich schon: hohe Karte loswerden.
    return asc[asc.length - 1];
  }
  // Der Spieler kommt noch: klein bleiben, damit er drüber muss.
  return asc[0];
}

/** Bettel: der Spieler drückt sich unter dem Stich, die Gegner spielen klein. */
function bettelCard(s: GameState, me: number, legal: CardId[]): CardId {
  const c = s.contract!;
  const low = [...legal].sort((a, b) => suitPower(a, c) - suitPower(b, c));
  if (me !== s.declarer) return low[0];
  const trick = s.current!;
  if (trick.cards.length === 0) return low[0];
  const under = legal.filter((x) => trickWinnerIndex([...trick.cards, x], c) !== trick.cards.length);
  if (under.length) return under.sort((a, b) => suitPower(b, c) - suitPower(a, c))[0];
  return low[0];
}

/** Ramsch: möglichst keine Stiche mit Augen, Augen lieber anderen geben. */
function ramschCard(s: GameState, me: number, legal: CardId[]): CardId {
  const c = s.contract!;
  const trick = s.current!;
  const strength = (x: CardId) => (isTrump(x, c) ? 20 + trumpPower(x, c) : suitPower(x, c));
  if (trick.cards.length === 0) return [...legal].sort((a, b) => strength(a) - strength(b))[0];
  const under = legal.filter((x) => trickWinnerIndex([...trick.cards, x], c) !== trick.cards.length);
  if (under.length) return under.sort((a, b) => pointsOf(b) - pointsOf(a) || strength(b) - strength(a))[0];
  // Man muss stechen: als Letzter die stärkste Karte loswerden, sonst die billigste.
  if (trick.cards.length === 3) return [...legal].sort((a, b) => strength(b) - strength(a))[0];
  return [...legal].sort((a, b) => pointsOf(a) - pointsOf(b) || strength(a) - strength(b))[0];
}
