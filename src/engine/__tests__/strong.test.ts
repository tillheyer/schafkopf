import { describe, expect, it } from 'vitest';
import {
  CardId,
  DEFAULT_RULES,
  GameState,
  Rules,
  applyAction,
  chooseAction,
  chooseCard,
  chooseStrongAction,
  createRng,
  dealGame,
  finishGame,
  isTrump,
  newMatch,
  payoutsOf,
  redactFor,
  shuffle,
  bettelForced,
} from '../index';

const ALL_RULES: Rules = Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, true])) as unknown as Rules;
const fast = (seed: number) => ({ samples: 6, rng: createRng(seed) });

function state(hands: CardId[][], contract: GameState['contract'], declarer: number, leader: number): GameState {
  return {
    dealer: 3,
    initialHands: hands.map((h) => [...h]),
    hands: hands.map((h) => [...h]),
    phase: 'playing',
    // Ansagen: der Spieler hat sein Spiel angesagt, die anderen "weiter".
    bids: [0, 1, 2, 3].map((p) => ({ player: p, contract: p === declarer ? contract : null })),
    turn: leader,
    contract,
    declarer,
    partner: contract?.kind === 'sauspiel' ? hands.findIndex((h) => h.includes(`${contract.suit}A` as CardId)) : null,
    tricks: [],
    current: { leader, cards: [] },
    result: null,
    kontra: null,
    re: null,
    rules: DEFAULT_RULES,
  };
}

describe('Sehr starker Computergegner', () => {
  it('spielt mit allen Sonderregeln regelkonform ganze Partien', () => {
    let m = newMatch(ALL_RULES);
    for (let seed = 1; seed <= 60; seed++) {
      let s = dealGame(m, createRng(seed * 13));
      let steps = 0;
      while (s.phase !== 'finished') {
        const a = s.turn % 2 === 0 ? chooseStrongAction(s, s.turn, fast(seed + steps)) : chooseAction(s, s.turn);
        s = applyAction(s, a);
        if (++steps > 120) throw new Error('Endlosschleife');
      }
      expect(payoutsOf(s.result).reduce((a, b) => a + b, 0)).toBe(0);
      m = finishGame(m, s);
    }
  }, 60000);

  it('schaut nicht in fremde Karten: andere verdeckte Verteilung, gleiche Entscheidung', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = dealGame(newMatch(), createRng(seed));
      // Bis in die Mitte des Spiels laufen lassen.
      while (s.phase !== 'finished' && (s.phase !== 'playing' || s.tricks.length < 3)) s = applyAction(s, chooseAction(s, s.turn));
      if (s.phase !== 'playing') continue;
      const me = s.turn;
      // Fremde Karten untereinander neu mischen (Handgrößen bleiben gleich).
      const others = [0, 1, 2, 3].filter((p) => p !== me && !(s.contract?.kind === 'bettel'));
      const pool = shuffle(others.flatMap((p) => s.hands[p]), createRng(seed + 99));
      const hands = s.hands.map((h) => [...h]);
      let k = 0;
      for (const p of others) hands[p] = pool.slice(k, (k += s.hands[p].length));
      const variant: GameState = { ...s, hands, initialHands: s.initialHands.map((h, i) => (i === me ? h : [...h].reverse())) };
      // Der Partner bleibt verdeckt, wenn er nicht bekannt ist.
      expect(redactFor(variant, me)).toEqual(redactFor(s, me));
      expect(chooseStrongAction(variant, me, fast(seed))).toEqual(chooseStrongAction(s, me, fast(seed)));
    }
  });

  it('sticht als Gegenspieler, wenn der Spieler eine Farbe aufspielt', () => {
    // Herz-Solo von Spieler 0, er spielt die Gras-Sau. Spieler 1 hat kein Gras, aber kleine Trümpfe.
    const hands: CardId[][] = [
      ['GA', 'EO', 'GO', 'HO', 'EU', 'HA', 'H10', 'HK'],
      ['H7', 'H8', 'SU', 'EA', 'E10', 'SA', 'S10', 'E9'],
      ['GK', 'G10', 'G9', 'E8', 'S9', 'S8', 'EK', 'E7'],
      ['G8', 'G7', 'SO', 'GU', 'HU', 'H9', 'SK', 'S7'],
    ];
    let s = state(hands, { kind: 'solo', suit: 'H' }, 0, 0);
    s = applyAction(s, { type: 'play', player: 0, card: 'GA' });
    const strong = chooseStrongAction(s, 1, { samples: 30, rng: createRng(1) });
    expect(strong.type).toBe('play');
    expect(isTrump((strong as { card: CardId }).card, s.contract!)).toBe(true);
    expect(isTrump(chooseCard(s, 1), s.contract!)).toBe(true);
  });

  it('sticht im Sauspiel als Gegenspieler eine Farbe des Spielers', () => {
    // Sauspiel auf die Eichel von Spieler 2; er spielt die Schellen-Sau, Spieler 3 ist schellenfrei.
    const hands: CardId[][] = [
      ['EA', 'E7', 'G7', 'G8', 'S7', 'H7', 'H8', 'GK'],
      ['EK', 'E8', 'G9', 'S10', 'S8', 'S9', 'H9', 'SK'],
      ['EO', 'GO', 'HO', 'SO', 'E9', 'SA', 'HA', 'H10'],
      ['EU', 'GU', 'HU', 'SU', 'E10', 'GA', 'HK', 'G10'],
    ];
    let s = state(hands, { kind: 'sauspiel', suit: 'E' }, 2, 2);
    s = applyAction(s, { type: 'play', player: 2, card: 'SA' });
    let a = chooseStrongAction(s, 3, { samples: 30, rng: createRng(2) });
    // Mit vier Untern gibt er vorher womöglich Kontra – dann ist er gleich wieder dran.
    if (a.type === 'kontra') {
      s = applyAction(s, a);
      a = chooseStrongAction(s, 3, { samples: 30, rng: createRng(2) });
    }
    expect(a.type).toBe('play');
    expect(isTrump((a as { card: CardId }).card, s.contract!)).toBe(true);
    expect(isTrump(chooseCard(s, 3), s.contract!)).toBe(true);
  });

  it('Bettel: sichere Hand hält, Hand mit hohen Karten wird gezwungen', () => {
    const c = { kind: 'bettel' } as const;
    const safe: CardId[] = ['E7', 'E8', 'G7', 'G8', 'S7', 'S8', 'H7', 'H8'];
    const risky: CardId[] = ['EK', 'E9', 'G7', 'G9', 'S7', 'E7', 'SO', 'S10'];
    const others = (h: CardId[]) => {
      const rest = shuffle(
        (['E', 'G', 'H', 'S'] as const).flatMap((su) => ['7', '8', '9', '10', 'U', 'O', 'K', 'A'].map((r) => `${su}${r}` as CardId)).filter((x) => !h.includes(x)),
        createRng(3),
      );
      return [h, rest.slice(0, 8), rest.slice(8, 16), rest.slice(16, 24)];
    };
    expect(bettelForced(others(safe), 0, 1, c)).toBe(false);
    // Eichel 7, 9, König: wer Eichel 8 und 10 hat, zwingt den König heraus.
    const h = others(risky);
    const defendersE = h.slice(1).flat().filter((x) => x[0] === 'E');
    if (defendersE.includes('E8') && defendersE.includes('E10')) expect(bettelForced(h, 0, 1, c)).toBe(true);
  });
});
