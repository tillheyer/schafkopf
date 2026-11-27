/**
 * Vergleich zweier Computer mit gleichen Karten ("Duplikat"): jede Verteilung wird
 * zweimal gespielt, einmal sitzt A auf den Plätzen 0+2 und B auf 1+3, dann getauscht.
 * Ausgabe je Verteilung: Cent von A minus Cent von B (pro Spieler und Spiel).
 * Aufruf: node eval.js <A> <B> <ersteVerteilung> <anzahl> <regeln: default|all> [samples]
 */
import { DEFAULT_RULES, GameState, Rules, applyAction, createRng, dealGame, newMatch, payoutsOf } from '../src/engine';
import { megaPlayer, Player } from './players';

const ALL_RULES: Rules = Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, true])) as unknown as Rules;
const [aSpec, bSpec, firstArg, countArg, rulesArg, samplesArg] = process.argv.slice(2);
const A = megaPlayer(aSpec);
const B = megaPlayer(bSpec);
const samples = Number(samplesArg ?? 48);
const rules = rulesArg === 'all' ? ALL_RULES : DEFAULT_RULES;

function play(seed: number, seatsA: number[]): number[] {
  const m = newMatch(rules, seed % 4);
  let s: GameState = dealGame(m, createRng(seed * 7919 + 1));
  const rng = createRng(seed * 104729 + 3);
  let guard = 0;
  while (s.phase !== 'finished') {
    if (++guard > 200) throw new Error('Endlosschleife');
    const who: Player = seatsA.includes(s.turn) ? A : B;
    s = applyAction(s, who(s, s.turn, { samples, rng }));
  }
  return payoutsOf(s.result);
}

const first = Number(firstArg);
for (let d = first; d < first + Number(countArg); d++) {
  const p1 = play(d, [0, 2]);
  const p2 = play(d, [1, 3]);
  const a = p1[0] + p1[2] + p2[1] + p2[3];
  const b = p1[1] + p1[3] + p2[0] + p2[2];
  // pro Spieler und Spiel: (A-Summe − B-Summe) / (2 Spieler × 2 Spiele)
  console.log(JSON.stringify({ d, diff: (a - b) / 4, same: JSON.stringify(p1) === JSON.stringify([p2[0], p2[1], p2[2], p2[3]]) }));
}
