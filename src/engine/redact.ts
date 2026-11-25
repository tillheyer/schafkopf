import { CardId } from './cards';
import { GameState, calledAcePlayed } from './game';

/** Platzhalter für Karten, die ein Spieler nicht sehen darf. */
export const HIDDEN = '??' as CardId;

/**
 * Sicht eines Spielers auf den Zustand: fremde Hände werden verdeckt,
 * der Sau-Partner bleibt geheim, bis die Sau gefallen ist.
 * Wird vom Online-Server verwendet, damit niemand fremde Karten mitlesen kann.
 */
export function redactFor(s: GameState, seat: number): GameState {
  const finished = s.phase === 'finished';
  const partnerKnown =
    finished || s.partner === seat || (s.phase === 'playing' && calledAcePlayed(s));
  return {
    ...s,
    hands: s.hands.map((h, i) => (i === seat || finished ? h : h.map(() => HIDDEN))),
    initialHands: finished ? s.initialHands : s.initialHands.map((h, i) => (i === seat ? h : [])),
    partner: partnerKnown ? s.partner : null,
  };
}
