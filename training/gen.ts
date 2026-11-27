/**
 * Erzeugt Trainingsdaten: der starke Computer spielt gegen sich selbst; für jede
 * Kartenentscheidung werden die Merkmale (nur Spielersicht), die erlaubten Karten,
 * die Monte-Carlo-Werte jeder Karte, die gewählte Karte und das Endergebnis gespeichert.
 * Aufruf: node gen.js <seed> <spiele> <datei>
 */
import { writeFileSync } from 'fs';
import {
  Action, CardId, DEFAULT_RULES, GameState, Rules, applyAction, chooseAction, chooseStrongAction,
  createRng, dealGame, finishGame, legalCards, newMatch, payoutsOf, redactFor, MatchInfo,
} from '../src/engine';
import { CARD_INDEX, FEATURES, encode, stakeOf } from '../src/engine/mega/features';
import { megaPlayer } from './players';

export const REC = FEATURES + 4 + 128 + 1 + 4 + 4 + 1 + 1;

const ALL_RULES: Rules = Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, true])) as unknown as Rules;

const [seedArg, gamesArg, outFile, mode] = process.argv.slice(2);
const seed = Number(seedArg);
const games = Number(gamesArg);
const rng = createRng(seed);
const chunks: Buffer[] = [];
let samples = 0;
const feat = new Float32Array(FEATURES);
const mega = mode ? megaPlayer(mode) : null;
const SAMPLES = Number(process.env.SAMPLES ?? 48);

let m: MatchInfo = newMatch(DEFAULT_RULES);
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  if (g % 50 === 0) {
    const all = rng() < 0.5;
    m = newMatch(all ? ALL_RULES : DEFAULT_RULES, Math.floor(rng() * 4));
  }
  const weak = rng() < 0.15 ? Math.floor(rng() * 4) : -1;
  let s: GameState = dealGame(m, rng);
  const pending: { buf: Buffer; seat: number; stakeAt: () => number }[] = [];
  let guard = 0;
  while (s.phase !== 'finished') {
    if (++guard > 200) throw new Error('Endlosschleife');
    const p = s.turn;
    let a: Action;
    if (p === weak) {
      a = chooseAction(s, p);
    } else if (s.phase === 'playing' && legalCards(s, p).length > 1) {
      let cards: CardId[] = [];
      let vals: number[] = [];
      const opts = { samples: SAMPLES, rng, onScores: (c: CardId[], v: number[]) => { cards = c; vals = v; } };
      a = mega ? mega(s, p, opts) : chooseStrongAction(s, p, opts);
      if (a.type === 'play' && cards.length) {
        const view = redactFor(s, p);
        encode(view, p, feat);
        const stake = stakeOf(s);
        const buf = Buffer.alloc(REC);
        let o = 0;
        for (let i = 0; i < FEATURES; i++) buf[o + i] = Math.round(Math.min(1, Math.max(0, feat[i])) * 255);
        o += FEATURES;
        let mask = 0;
        for (const x of legalCards(s, p)) mask |= 1 << CARD_INDEX[x];
        buf.writeUInt32LE(mask >>> 0, o); o += 4;
        for (let i = 0; i < 32; i++) buf.writeFloatLE(NaN, o + i * 4);
        cards.forEach((x, i) => buf.writeFloatLE(vals[i] / stake, o + CARD_INDEX[x] * 4));
        o += 128;
        buf[o++] = CARD_INDEX[a.card];
        buf.writeFloatLE(stake, o + 4);
        pending.push({ buf, seat: p, stakeAt: () => stake });
      }
    } else {
      a = mega ? mega(s, p, { samples: SAMPLES, rng }) : chooseStrongAction(s, p, { samples: SAMPLES, rng });
    }
    s = applyAction(s, a!);
  }
  const pay = payoutsOf(s.result);
  for (const r of pending) {
    const o = FEATURES + 4 + 128 + 1;
    r.buf.writeFloatLE(pay[r.seat] / r.stakeAt(), o);
    r.buf[o + 8] = r.seat === weak ? 1 : 0;
    r.buf[o + 9] = m.rules.geier ? 1 : 0;
    chunks.push(r.buf);
    samples++;
  }
  m = finishGame(m, s);
  if ((g + 1) % 200 === 0) console.error(`seed ${seed}: ${g + 1}/${games} Spiele, ${samples} Beispiele, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
writeFileSync(outFile, Buffer.concat(chunks));
console.error(`fertig: ${samples} Beispiele`);
