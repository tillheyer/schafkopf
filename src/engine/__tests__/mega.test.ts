import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  GameState,
  Rules,
  applyAction,
  chooseAction,
  chooseBotAction,
  chooseMegaAction,
  createRng,
  dealGame,
  legalCards,
  netCardValues,
  newMatch,
  payoutsOf,
  redactFor,
  shuffle,
} from '../index';
import { FEATURES, encode } from '../mega/features';
import { decodeBase64 } from '../mega/net';

const ALL_RULES: Rules = Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, true])) as unknown as Rules;
const fast = (seed: number) => ({ samples: 6, rng: createRng(seed) });

describe('MEGA (neuronales Netz)', () => {
  it('base64 wird richtig entschlüsselt', () => {
    expect(Array.from(decodeBase64('AAEC/w=='))).toEqual([0, 1, 2, 255]);
    expect(Array.from(decodeBase64('aGFsbG8'))).toEqual([104, 97, 108, 108, 111]);
  });

  it('spielt mit allen Sonderregeln regelkonform ganze Partien', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = dealGame(newMatch(seed % 2 ? ALL_RULES : DEFAULT_RULES), createRng(seed * 31));
      let steps = 0;
      while (s.phase !== 'finished') {
        const a = s.turn % 2 === 0 ? chooseBotAction(s, s.turn, 'mega', fast(seed + steps)) : chooseAction(s, s.turn);
        s = applyAction(s, a);
        if (++steps > 120) throw new Error('Endlosschleife');
      }
      expect(payoutsOf(s.result).reduce((a, b) => a + b, 0)).toBe(0);
    }
  }, 60000);

  it('nur das Netz: wählt immer eine erlaubte Karte', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = dealGame(newMatch(ALL_RULES), createRng(seed * 17));
      let steps = 0;
      while (s.phase !== 'finished') {
        if (s.phase === 'playing') {
          const a = chooseMegaAction(s, s.turn, { ...fast(seed), netOnly: true });
          if (a.type === 'play') expect(legalCards(s, s.turn)).toContain(a.card);
          s = applyAction(s, a);
        } else s = applyAction(s, chooseAction(s, s.turn));
        if (++steps > 120) throw new Error('Endlosschleife');
      }
    }
  });

  it('Merkmale hängen nur von der eigenen Sicht ab (auch ohne redactFor)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = dealGame(newMatch(ALL_RULES), createRng(seed * 3));
      while (s.phase !== 'finished') {
        if (s.phase === 'playing') expect(Array.from(encode(s, s.turn))).toEqual(Array.from(encode(redactFor(s, s.turn), s.turn)));
        s = applyAction(s, chooseAction(s, s.turn));
      }
    }
  });

  it('Merkmale liegen zwischen 0 und 1', () => {
    let s = dealGame(newMatch(ALL_RULES), createRng(5));
    while (s.phase !== 'finished') {
      if (s.phase === 'playing') {
        const x = encode(redactFor(s, s.turn), s.turn);
        expect(x.length).toBe(FEATURES);
        for (const v of x) expect(v >= 0 && v <= 1).toBe(true);
      }
      s = applyAction(s, chooseAction(s, s.turn));
    }
  });

  it('schaut nicht in fremde Karten: andere verdeckte Verteilung, gleiche Einschätzung', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = dealGame(newMatch(), createRng(seed));
      while (s.phase !== 'finished' && (s.phase !== 'playing' || s.tricks.length < 3)) s = applyAction(s, chooseAction(s, s.turn));
      if (s.phase !== 'playing') continue;
      const me = s.turn;
      const others = [0, 1, 2, 3].filter((p) => p !== me);
      const pool = shuffle(others.flatMap((p) => s.hands[p]), createRng(seed + 99));
      const hands = s.hands.map((h) => [...h]);
      let k = 0;
      for (const p of others) hands[p] = pool.slice(k, (k += s.hands[p].length));
      const variant: GameState = { ...s, hands, initialHands: s.initialHands.map((h, i) => (i === me ? h : [...h].reverse())) };
      const legal = legalCards(s, me);
      expect(netCardValues(variant, me, legal)).toEqual(netCardValues(s, me, legal));
      expect(chooseMegaAction(variant, me, fast(seed))).toEqual(chooseMegaAction(s, me, fast(seed)));
    }
  });
});
