import { GameState, newGame, next } from './game';
import { DEFAULT_RULES, Rules } from './options';
import { Rng } from './rng';
import { isSoloLike } from './rules';
import { payoutsOf, Tarif } from './scoring';

/**
 * Alles, was über ein einzelnes Spiel hinaus gilt: Geber, Spielstand,
 * Bockrunden und Muss-Spiel. Wird offline und vom Server gleich verwendet.
 */
export interface MatchInfo {
  dealer: number;
  gameNo: number;
  totals: number[];
  /** Verbleibende Spiele je laufender Bockrunde (überlappend = Kreuzbock). */
  bock: number[];
  muss: boolean;
  rules: Rules;
  tarif?: Tarif;
}

export function newMatch(rules: Rules = DEFAULT_RULES, dealer = 3): MatchInfo {
  return { dealer, gameNo: 1, totals: [0, 0, 0, 0], bock: [], muss: false, rules };
}

/** Faktor für das nächste Spiel: Bock ×2, überlappend (Kreuzbock) ×4, nie mehr. */
export const bockFactor = (m: MatchInfo): number => (m.rules.bock ? 2 ** Math.min(2, m.bock.length) : 1);

export function dealGame(m: MatchInfo, rng: Rng): GameState {
  return newGame(m.dealer, rng, { rules: m.rules, tarif: m.tarif, bock: bockFactor(m), muss: m.muss && m.rules.muss });
}

/** Spiel abrechnen und das nächste vorbereiten. */
export function finishGame(m: MatchInfo, g: GameState): MatchInfo {
  const r = g.result;
  const payouts = payoutsOf(r);
  const bock = m.bock.map((n) => n - 1).filter((n) => n > 0);
  if (m.rules.bock && r) {
    // ANNAHME: Bock nach Kontra, verlorenem Solo oder wenn alle weiter sagen.
    const trigger =
      r.kind === 'zamgeworfen' ||
      (r.kind === 'played' && (r.kontra || (isSoloLike(r.contract) && !r.declarerWon)));
    if (trigger) bock.push(4);
  }
  return {
    ...m,
    dealer: next(m.dealer),
    gameNo: m.gameNo + 1,
    totals: m.totals.map((t, i) => t + payouts[i]),
    bock,
    muss: m.rules.muss && r?.kind === 'zamgeworfen',
  };
}
