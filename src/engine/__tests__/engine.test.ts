import { describe, expect, it } from 'vitest';
import {
  CardId,
  GameState,
  applyAction,
  chooseAction,
  createRng,
  fullDeck,
  legalCards,
  newGame,
  scoreGame,
  sumPoints,
  trickWinnerIndex,
  trumpOrder,
  countLaufende,
  scoreRamsch,
  canKontra,
  canRe,
  DEFAULT_RULES,
  Rules,
  newMatch,
  dealGame,
  finishGame,
  payoutsOf,
  isTrump,
  trickWinnerIndex as winIdx,
  legalBids,
} from '../index';

const sau = { kind: 'sauspiel', suit: 'E' } as const;
const wenz = { kind: 'wenz' } as const;

describe('Karten', () => {
  it('32 Karten mit 120 Augen', () => {
    expect(fullDeck()).toHaveLength(32);
    expect(sumPoints(fullDeck())).toBe(120);
  });
});

describe('Trumpf und Stich', () => {
  it('Sauspiel: 14 Trümpfe, Eichel-Ober höchster, Herz-Sieben niedrigster', () => {
    const order = trumpOrder(sau);
    expect(order).toHaveLength(14);
    expect(order[0]).toBe('EO');
    expect(order[4]).toBe('EU');
    expect(order[8]).toBe('HA');
    expect(order[13]).toBe('H7');
  });
  it('Wenz: nur die 4 Unter sind Trumpf', () => {
    expect(trumpOrder(wenz)).toEqual(['EU', 'GU', 'HU', 'SU']);
  });
  it('Farbe: höchste Karte der ausgespielten Farbe gewinnt, andere Farben nicht', () => {
    expect(trickWinnerIndex(['G10', 'GA', 'SA', 'G7'], sau)).toBe(1);
    expect(trickWinnerIndex(['G10', 'G9', 'SA', 'G7'], sau)).toBe(0);
  });
  it('Trumpf sticht Farbe, Herz ist im Sauspiel Trumpf', () => {
    expect(trickWinnerIndex(['GA', 'H7', 'G10', 'GK'], sau)).toBe(1);
    expect(trickWinnerIndex(['GA', 'H7', 'SU', 'GK'], sau)).toBe(2);
  });
  it('Wenz: Ober zählt als Farbe zwischen König und Neun', () => {
    expect(trickWinnerIndex(['GO', 'G9', 'GK', 'G8'], wenz)).toBe(2);
    expect(trickWinnerIndex(['HA', 'HO', 'SU', 'H10'], wenz)).toBe(2);
  });
});

function playingState(hands: CardId[][], contract = sau, declarer = 0): GameState {
  const partner =
    contract.kind === 'sauspiel' ? hands.findIndex((h) => h.includes(`${contract.suit}A` as CardId)) : null;
  return {
    dealer: 3,
    initialHands: hands.map((h) => [...h]),
    hands,
    phase: 'playing',
    bids: [],
    turn: 0,
    contract,
    declarer,
    partner,
    tricks: [],
    current: { leader: 0, cards: [] },
    result: null,
  };
}

describe('Sauspiel-Regeln zur gerufenen Sau', () => {
  const hands: CardId[][] = [
    ['EO', 'GO', 'HO', 'SO', 'E7', 'GA', 'SA', 'HA'],
    ['EA', 'E8', 'E9', 'G7', 'G8', 'S7', 'S8', 'H7'],
    ['E10', 'EK', 'G9', 'G10', 'S9', 'S10', 'H8', 'H9'],
    ['EU', 'GU', 'HU', 'SU', 'GK', 'SK', 'HK', 'H10'],
  ];
  it('wird die Farbe gesucht, muss die Sau zugegeben werden', () => {
    let s = playingState(hands.map((h) => [...h]));
    s = applyAction(s, { type: 'play', player: 0, card: 'E7' });
    expect(legalCards(s, 1)).toEqual(['EA']);
  });
  it('die gerufene Sau darf nicht geschmiert werden', () => {
    const h = hands.map((x) => [...x]);
    let s = playingState(h);
    s = applyAction(s, { type: 'play', player: 0, card: 'EO' });
    expect(legalCards(s, 1)).toEqual(['H7']);
  });
  it('Sau-Besitzer darf die Farbe nur mit der Sau anspielen (unter 4 Karten)', () => {
    const s = { ...playingState(hands.map((h) => [...h])), turn: 1, current: { leader: 1, cards: [] } };
    const legal = legalCards(s, 1);
    expect(legal).toContain('EA');
    expect(legal).not.toContain('E8');
    expect(legal).not.toContain('E9');
  });
});

describe('Abrechnung', () => {
  const initialHands: CardId[][] = [
    ['EO', 'GO', 'HO', 'E7', 'GA', 'SA', 'HA', 'G7'],
    ['EA', 'SO', 'E9', 'G8', 'S7', 'S8', 'H7', 'E8'],
    ['E10', 'EK', 'G9', 'G10', 'S9', 'S10', 'H8', 'H9'],
    ['EU', 'GU', 'HU', 'SU', 'GK', 'SK', 'HK', 'H10'],
  ];
  it('Laufende: 4 Ober beim Spieler und Partner', () => {
    expect(countLaufende(sau, initialHands, [0, 1])).toBe(4);
  });
  it('Sauspiel gewonnen mit Schneider und 4 Laufenden: 10+10+40 = 60', () => {
    const r = scoreGame({ contract: sau, declarer: 0, partner: 1, declarerPoints: 95, declarerTricks: 6, initialHands });
    expect(r.declarerWon).toBe(true);
    expect(r.schneider).toBe(true);
    expect(r.amount).toBe(60);
    expect(r.payouts).toEqual([60, 60, -60, -60]);
  });
  it('mit 60 Augen ist das Spiel verloren', () => {
    const r = scoreGame({ contract: sau, declarer: 0, partner: 1, declarerPoints: 60, declarerTricks: 4, initialHands });
    expect(r.declarerWon).toBe(false);
    expect(r.payouts.reduce((a, b) => a + b, 0)).toBe(0);
  });
  it('Solo: alle drei zahlen, Schwarz', () => {
    const r = scoreGame({
      contract: { kind: 'solo', suit: 'H' },
      declarer: 0,
      partner: null,
      declarerPoints: 120,
      declarerTricks: 8,
      initialHands,
    });
    // 3 Laufende "mit" (EO, GO, HO), dann SO beim Gegner
    expect(r.laufende).toBe(3);
    expect(r.amount).toBe(50 + 10 + 10 + 30);
    expect(r.payouts).toEqual([300, -100, -100, -100]);
  });
});

describe('Kontra und Re', () => {
  const initialHands: CardId[][] = [
    ['EO', 'GO', 'HO', 'E7', 'GA', 'SA', 'HA', 'G7'],
    ['EA', 'SO', 'E9', 'G8', 'S7', 'S8', 'H7', 'E8'],
    ['E10', 'EK', 'G9', 'G10', 'S9', 'S10', 'H8', 'H9'],
    ['EU', 'GU', 'HU', 'SU', 'GK', 'SK', 'HK', 'H10'],
  ];
  const playing = (): GameState => ({
    dealer: 3,
    initialHands,
    hands: initialHands.map((h) => [...h]),
    phase: 'playing',
    bids: [],
    turn: 0,
    contract: sau,
    declarer: 0,
    partner: 1,
    tricks: [],
    current: { leader: 0, cards: [] },
    result: null,
    kontra: null,
    re: null,
  });
  it('nur die Gegenpartei darf Kontra geben, bis sie selbst eine Karte gespielt hat', () => {
    let s = playing();
    expect(canKontra(s, 0)).toBe(false);
    expect(canKontra(s, 1)).toBe(false);
    expect(canKontra(s, 2)).toBe(true);
    s = applyAction(s, { type: 'play', player: 0, card: 'G7' });
    s = applyAction(s, { type: 'play', player: 1, card: 'G8' });
    s = applyAction(s, { type: 'play', player: 2, card: 'G9' });
    expect(canKontra(s, 2)).toBe(false);
    expect(canKontra(s, 3)).toBe(true);
    // Kontra geht auch, wenn man gerade nicht dran ist.
    expect(() => applyAction(playing(), { type: 'kontra', player: 3 })).not.toThrow();
  });
  it('Re nur nach Kontra und nur von der Spielerpartei', () => {
    let s = playing();
    expect(canRe(s, 0)).toBe(false);
    s = applyAction(s, { type: 'kontra', player: 2 });
    expect(canKontra(s, 3)).toBe(false);
    expect(canRe(s, 3)).toBe(false);
    expect(canRe(s, 1)).toBe(true);
    s = applyAction(s, { type: 're', player: 0 });
    expect(s.re).toBe(0);
    expect(() => applyAction(s, { type: 're', player: 1 })).toThrow();
  });
  it('Kontra verdoppelt, Re vervierfacht den Spielwert', () => {
    const base = { contract: sau, declarer: 0, partner: 1, declarerPoints: 70, declarerTricks: 5, initialHands } as const;
    expect(scoreGame({ ...base }).amount).toBe(50);
    expect(scoreGame({ ...base, kontra: true }).amount).toBe(100);
    const r = scoreGame({ ...base, kontra: true, re: true });
    expect(r.amount).toBe(200);
    expect(r.payouts).toEqual([200, 200, -200, -200]);
  });
});

describe('Komplette Spiele mit Computergegnern', () => {
  it('1000 zufällige Spiele laufen regelkonform durch', () => {
    let played = 0;
    let kontras = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = createRng(seed);
      let s = newGame(seed % 4, rng);
      let steps = 0;
      while (s.phase !== 'finished') {
        s = applyAction(s, chooseAction(s, s.turn));
        if (++steps > 100) throw new Error('Endlosschleife');
      }
      expect(s.result).not.toBeNull();
      if (s.result!.kind === 'played') {
        played++;
        expect(s.tricks).toHaveLength(8);
        expect(s.result!.payouts.reduce((a, b) => a + b, 0)).toBe(0);
        expect(s.result!.declarerPoints + s.result!.opponentPoints).toBe(120);
        if (s.result!.kontra) kontras++;
      }
    }
    expect(played).toBeGreaterThan(300);
    expect(kontras).toBeGreaterThan(0);
  });
});

const ALL_RULES: Rules = Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, true])) as unknown as Rules;

describe('Sonderspiele', () => {
  it('Geier: nur Ober sind Trumpf, Unter zwischen König und Neun', () => {
    const g = { kind: 'geier' } as const;
    expect(trumpOrder(g)).toEqual(['EO', 'GO', 'HO', 'SO']);
    expect(isTrump('EU', g)).toBe(false);
    expect(winIdx(['GK', 'GU'], g)).toBe(0);
    expect(winIdx(['GU', 'G9'], g)).toBe(0);
  });
  it('Farbwenz: Unter und Farbe sind Trumpf (11 Trümpfe)', () => {
    expect(trumpOrder({ kind: 'farbwenz', suit: 'G' })).toHaveLength(11);
    expect(trumpOrder({ kind: 'farbgeier', suit: 'S' })[0]).toBe('EO');
  });
  it('Bettel: keine Trümpfe, Ass > König > Ober > Unter > Zehn', () => {
    const b = { kind: 'bettel' } as const;
    expect(trumpOrder(b)).toEqual([]);
    expect(winIdx(['E10', 'EU'], b)).toBe(1);
    expect(winIdx(['EO', 'EK', 'EA'], b)).toBe(2);
  });
  it('Bettel gewonnen ohne Stich, Brett doppelt; Tout doppelt; Bock', () => {
    const hands: CardId[][] = [[], [], [], []];
    const bettel = scoreGame({ contract: { kind: 'bettel', brett: true }, declarer: 0, partner: null, declarerPoints: 0, declarerTricks: 0, initialHands: hands });
    expect(bettel.declarerWon).toBe(true);
    expect(bettel.amount).toBe(100);
    const lost = scoreGame({ contract: { kind: 'bettel' }, declarer: 0, partner: null, declarerPoints: 11, declarerTricks: 1, initialHands: hands, bock: 2 });
    expect(lost.declarerWon).toBe(false);
    expect(lost.amount).toBe(100);
    expect(lost.payouts).toEqual([-300, 100, 100, 100]);
  });
  it('Ramsch: wer die meisten Augen hat, zahlt', () => {
    const r = scoreRamsch([
      { leader: 0, cards: ['EA', 'GA', 'HA', 'SA'], winner: 0 },
      { leader: 0, cards: ['E10', 'G7', 'H7', 'S7'], winner: 1 },
    ] as never);
    expect(r.losers).toEqual([0]);
    expect(r.payouts).toEqual([-30, 10, 10, 10]);
  });
  it('Muss-Spiel: wer den Eichel-Ober hat, darf nicht weiter sagen', () => {
    let s = newGame(3, createRng(5), { rules: { ...DEFAULT_RULES, muss: true }, muss: true });
    for (let i = 0; i < 4; i++) {
      const p = s.turn;
      const bids = legalBids(s, p);
      if (s.hands[p].includes('EO') && !s.bids.some((b) => b.contract)) expect(bids).not.toContain(null);
      s = applyAction(s, { type: 'bid', player: p, contract: s.hands[p].includes('EO') ? bids.find((b) => b !== null)! : null });
    }
    expect(s.phase).not.toBe('finished');
  });
  it('Hochzeit: Partner nimmt den Trumpf und gibt eine Karte zurück', () => {
    const hands: CardId[][] = [
      ['HO', 'EA', 'E10', 'GA', 'G10', 'SA', 'S10', 'EK'],
      ['E7', 'E8', 'E9', 'G7', 'G8', 'G9', 'S7', 'S8'],
      ['EO', 'GO', 'SO', 'EU', 'GU', 'HU', 'SU', 'HA'],
      ['H10', 'HK', 'H9', 'H8', 'H7', 'GK', 'SK', 'S9'],
    ];
    let s: GameState = { ...newGame(3, createRng(1), { rules: { ...DEFAULT_RULES, hochzeit: true } }), hands, initialHands: hands.map((h) => [...h]) };
    expect(legalBids(s, 0)).toContainEqual({ kind: 'hochzeit' });
    s = applyAction(s, { type: 'bid', player: 0, contract: { kind: 'hochzeit' } });
    for (const p of [1, 2, 3]) s = applyAction(s, { type: 'bid', player: p, contract: null });
    expect(s.phase).toBe('hochzeit');
    expect(s.turn).toBe(1);
    s = applyAction(s, { type: 'hochzeit', player: 1, accept: false });
    s = applyAction(s, { type: 'hochzeit', player: 2, accept: true, give: 'HA' });
    expect(s.phase).toBe('playing');
    expect(s.partner).toBe(2);
    expect(s.hands[0]).toContain('HA');
    expect(s.hands[0]).not.toContain('HO');
    expect(s.hands[2]).toContain('HO');
    expect(s.turn).toBe(0);
  });
  it('1000 Spiele mit allen Sonderregeln laufen regelkonform durch', () => {
    const kinds = new Map<string, number>();
    let m = newMatch(ALL_RULES);
    for (let seed = 1; seed <= 1000; seed++) {
      let s = dealGame(m, createRng(seed * 31));
      let steps = 0;
      while (s.phase !== 'finished') {
        s = applyAction(s, chooseAction(s, s.turn));
        if (++steps > 120) throw new Error('Endlosschleife');
      }
      const r = s.result!;
      kinds.set(r.kind === 'played' ? r.contract.kind + (('tout' in r.contract && r.contract.tout) ? '-tout' : '') : r.kind, (kinds.get(r.kind === 'played' ? r.contract.kind + (('tout' in r.contract && r.contract.tout) ? '-tout' : '') : r.kind) ?? 0) + 1);
      expect(payoutsOf(r).reduce((a, b) => a + b, 0)).toBe(0);
      if (r.kind === 'ramsch') expect(r.points.reduce((a, b) => a + b, 0)).toBe(120);
      m = finishGame(m, s);
    }
    expect(m.totals.reduce((a, b) => a + b, 0)).toBe(0);
    expect(kinds.get('ramsch') ?? 0).toBeGreaterThan(0);
    expect(kinds.has('zamgeworfen')).toBe(false);
    console.log(JSON.stringify(Object.fromEntries(kinds)));
  });
});
