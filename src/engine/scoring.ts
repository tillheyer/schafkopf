import { Contract, trumpOrder } from './rules';
import { CardId } from './cards';

/**
 * Tarif in Cent. ANNAHME: übliche Wirtshaus-Werte, später in den Einstellungen änderbar.
 * Sauspiel 10, Solo/Wenz 50, Schneider +10, Schwarz +10 (zusätzlich), je Laufender +10.
 */
export interface Tarif {
  sauspiel: number;
  solo: number;
  schneider: number;
  schwarz: number;
  laufender: number;
}

export const DEFAULT_TARIF: Tarif = {
  sauspiel: 10,
  solo: 50,
  schneider: 10,
  schwarz: 10,
  laufender: 10,
};

/** Ab wie vielen Laufenden gezahlt wird. ANNAHME: Sauspiel/Solo ab 3, Wenz ab 2. */
export const minLaufende = (c: Contract): number => (c.kind === 'wenz' ? 2 : 3);

export interface PlayedResult {
  kind: 'played';
  contract: Contract;
  declarer: number;
  partner: number | null;
  declarerTeam: number[];
  declarerPoints: number;
  opponentPoints: number;
  declarerTricks: number;
  declarerWon: boolean;
  schneider: boolean;
  schwarz: boolean;
  laufende: number;
  /** Betrag, den jeder Verlierer an einen Gewinner zahlt (Cent). */
  amount: number;
  /** Gewinn/Verlust je Spieler in Cent; Summe ist 0. */
  payouts: number[];
  breakdown: string[];
}

export type GameResult = { kind: 'zamgeworfen' } | PlayedResult;

/** Anzahl Laufende: ununterbrochene höchste Trümpfe in einer Partei (mit oder ohne). */
export function countLaufende(
  contract: Contract,
  initialHands: readonly CardId[][],
  declarerTeam: readonly number[],
): number {
  const owner = (card: CardId) => initialHands.findIndex((h) => h.includes(card));
  const order = trumpOrder(contract);
  const firstSide = declarerTeam.includes(owner(order[0]));
  let n = 0;
  for (const card of order) {
    if (declarerTeam.includes(owner(card)) !== firstSide) break;
    n++;
  }
  return n;
}

export function scoreGame(args: {
  contract: Contract;
  declarer: number;
  partner: number | null;
  declarerPoints: number;
  declarerTricks: number;
  initialHands: readonly CardId[][];
  tarif?: Tarif;
}): PlayedResult {
  const { contract, declarer, partner, declarerPoints, declarerTricks, initialHands } = args;
  const tarif = args.tarif ?? DEFAULT_TARIF;
  const declarerTeam = partner === null ? [declarer] : [declarer, partner];
  const opponentPoints = 120 - declarerPoints;
  const declarerWon = declarerPoints >= 61;
  const loserPoints = declarerWon ? opponentPoints : declarerPoints;
  const loserTricks = declarerWon ? 8 - declarerTricks : declarerTricks;
  const schneider = loserPoints <= 30;
  const schwarz = loserTricks === 0;
  const laufende = countLaufende(contract, initialHands, declarerTeam);

  const breakdown: string[] = [];
  const base = contract.kind === 'sauspiel' ? tarif.sauspiel : tarif.solo;
  breakdown.push(`${contract.kind === 'sauspiel' ? 'Sauspiel' : contract.kind === 'wenz' ? 'Wenz' : 'Solo'}: ${base}`);
  let amount = base;
  if (schneider) {
    amount += tarif.schneider;
    breakdown.push(`Schneider: +${tarif.schneider}`);
  }
  if (schwarz) {
    amount += tarif.schwarz;
    breakdown.push(`Schwarz: +${tarif.schwarz}`);
  }
  if (laufende >= minLaufende(contract)) {
    amount += laufende * tarif.laufender;
    breakdown.push(`${laufende} Laufende: +${laufende * tarif.laufender}`);
  }

  const payouts = [0, 0, 0, 0];
  const sign = declarerWon ? 1 : -1;
  for (let p = 0; p < 4; p++) {
    if (declarerTeam.includes(p)) {
      // Beim Solo/Wenz zahlen alle drei Gegner an den Spieler.
      payouts[p] = sign * amount * (partner === null ? 3 : 1);
    } else {
      payouts[p] = -sign * amount;
    }
  }

  return {
    kind: 'played',
    contract,
    declarer,
    partner,
    declarerTeam,
    declarerPoints,
    opponentPoints,
    declarerTricks,
    declarerWon,
    schneider,
    schwarz,
    laufende,
    amount,
    payouts,
    breakdown,
  };
}
