import { CardId } from './cards';
import { Action, GameState, canKontra, canRe, legalCards } from './game';
import { redactFor } from './redact';
import { StrongOptions, chooseStrongAction } from './strong';
import { CARD_INDEX, encode, stakeOf } from './mega/features';
import { MegaNet, NetJson } from './mega/net';
import { MEGA_ROLLOUT_WEIGHTS, MEGA_WEIGHTS } from './mega/weights';

/**
 * Schwierigkeit MEGA: der sehr starke Computer plus ein neuronales Netz.
 *
 * Das Netz hat aus vielen tausend Spielen gelernt, wie viel jede Karte in einer
 * Lage wert ist – zuerst vom starken Computer, danach aus Spielen gegen sich selbst.
 * Beim Kartenspielen spielt MEGA wie "Sehr stark" viele mögliche Kartenverteilungen
 * zu Ende – dabei wählt ein kleines Netz die Karten aller Spieler (statt fester
 * Regeln), und das große Netz gibt seine Einschätzung jeder Karte dazu. Es sieht dabei nur, was auch ein Mensch am Tisch
 * sieht (eigene Karten, gespielte Karten, Ansagen). Reizen, Kontra und Re
 * entscheidet MEGA wie "Sehr stark".
 */
export interface MegaOptions extends StrongOptions {
  /** Anteil des Netzes an der Bewertung (0 = nur Durchspielen, 1 = nur Netz). */
  mix?: number;
  /** Nur das Netz fragen, ohne Durchspielen (schnell, für Training/Tests). */
  netOnly?: boolean;
  /** Beim Durchspielen die Karten vom Netz wählen lassen statt mit den schnellen Regeln (Standard: ja). */
  netRollouts?: boolean;
  /** Anderes Netz verwenden (Training). */
  net?: MegaNet;
  /** Kleineres, schnelleres Netz fürs Durchspielen (Training). */
  rolloutNet?: MegaNet;
}

export const MEGA_MIX = 0.5;

let cachedRollout: MegaNet | null = null;
/** Kleines, schnelles Netz für das Durchspielen der Verteilungen. */
export function megaRolloutNet(): MegaNet {
  if (!cachedRollout) cachedRollout = new MegaNet(MEGA_ROLLOUT_WEIGHTS as NetJson);
  return cachedRollout;
}

let cached: MegaNet | null = null;
export function megaNet(json: NetJson = MEGA_WEIGHTS as NetJson): MegaNet {
  if (json !== MEGA_WEIGHTS) return new MegaNet(json);
  if (!cached) cached = new MegaNet(json);
  return cached;
}

/** Einschätzung des Netzes für jede erlaubte Karte, in Cent. */
export function netCardValues(full: GameState, me: number, cards: CardId[], net = megaNet()): number[] {
  const view = redactFor(full, me);
  const out = net.run(encode(view, me));
  const stake = stakeOf(view);
  return cards.map((x) => out.q[CARD_INDEX[x]] * stake);
}

/** Karte, die das Netz aus Sicht von `player` wählen würde. */
export function netPolicy(net = megaNet()): (s: GameState, player: number) => CardId {
  const buf = new Float32Array(net.features);
  return (s, player) => {
    const legal = legalCards(s, player);
    if (legal.length === 1) return legal[0];
    // Beim Durchspielen ohne Kopie: encode() liest ohnehin nur, was `player` sehen darf.
    const q = net.run(encode(s, player, buf)).q;
    const nn = legal.map((x) => q[CARD_INDEX[x]]);
    let best = 0;
    for (let i = 1; i < legal.length; i++) if (nn[i] > nn[best]) best = i;
    return legal[best];
  };
}

export function chooseMegaAction(full: GameState, me: number, opts: MegaOptions = {}): Action {
  const net = opts.net ?? megaNet();
  if (full.phase === 'playing' && full.turn === me) {
    const legal = legalCards(full, me);
    if (opts.netOnly && legal.length > 1) {
      // Kontra/Re weiterhin wie "Sehr stark"; die Kartenwahl übernimmt das Netz allein.
      if (canKontra(full, me) || canRe(full, me)) {
        const a = chooseStrongAction(full, me, opts);
        if (a.type !== 'play') return a;
      }
      const nn = netCardValues(full, me, legal, net);
      let best = 0;
      for (let i = 1; i < legal.length; i++) if (nn[i] > nn[best]) best = i;
      return { type: 'play', player: me, card: legal[best] };
    }
  }
  const mix = opts.mix ?? MEGA_MIX;
  const adjust = (cards: CardId[], values: number[]) => {
    const nn = netCardValues(full, me, cards, net);
    return values.map((v, i) => (1 - mix) * v + mix * nn[i]);
  };
  const rolloutPolicy = opts.netRollouts !== false ? netPolicy(opts.rolloutNet ?? (opts.net ? net : megaRolloutNet())) : opts.rolloutPolicy;
  return chooseStrongAction(full, me, { ...opts, adjust, rolloutPolicy });
}
