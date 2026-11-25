import { Contract, contractName, isSoloLike, isTout, trumpOrder } from './rules';
import { CardId, sumPoints } from './cards';
import type { Trick } from './game';

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
export const minLaufende = (c: Contract): number => (c.kind === 'wenz' || c.kind === 'geier' ? 2 : 3);

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
  kontra?: boolean;
  re?: boolean;
  bock?: number;
  /** Betrag, den jeder Verlierer an einen Gewinner zahlt (Cent). */
  amount: number;
  /** Gewinn/Verlust je Spieler in Cent; Summe ist 0. */
  payouts: number[];
  breakdown: string[];
}

export interface RamschResult {
  kind: 'ramsch';
  points: number[];
  tricks: number[];
  losers: number[];
  durchmarsch: number | null;
  amount: number;
  payouts: number[];
  breakdown: string[];
}

export type GameResult = { kind: 'zamgeworfen' } | PlayedResult | RamschResult;

export const payoutsOf = (r: GameResult | null): number[] =>
  r && r.kind !== 'zamgeworfen' ? r.payouts : [0, 0, 0, 0];

/**
 * Ramsch: wer die meisten Augen hat, zahlt jedem anderen den Sauspiel-Tarif
 * (bei Gleichstand zahlen alle mit den meisten Augen). Durchmarsch (alle Stiche)
 * gewinnt wie ein Solo.
 */
export function scoreRamsch(tricks: readonly Trick[], tarifArg?: Tarif, bock = 1): RamschResult {
  const tarif = tarifArg ?? DEFAULT_TARIF;
  const points = [0, 1, 2, 3].map((p) => sumPoints(tricks.filter((t) => t.winner === p).flatMap((t) => t.cards)));
  const counts = [0, 1, 2, 3].map((p) => tricks.filter((t) => t.winner === p).length);
  const payouts = [0, 0, 0, 0];
  const breakdown: string[] = [];
  const dm = counts.findIndex((n) => n === 8);
  let amount: number;
  let losers: number[] = [];
  if (dm >= 0) {
    amount = tarif.solo * bock;
    breakdown.push(`Durchmarsch: ${tarif.solo}`);
    for (let p = 0; p < 4; p++) payouts[p] = p === dm ? 3 * amount : -amount;
  } else {
    amount = tarif.sauspiel * bock;
    breakdown.push(`Ramsch: ${tarif.sauspiel}`);
    const max = Math.max(...points);
    losers = [0, 1, 2, 3].filter((p) => points[p] === max);
    if (losers.length < 4) {
      const winners = 4 - losers.length;
      for (let p = 0; p < 4; p++) payouts[p] = losers.includes(p) ? -amount * winners : amount * losers.length;
    }
  }
  if (bock > 1) breakdown.push(`Bock: ×${bock}`);
  return { kind: 'ramsch', points, tricks: counts, losers, durchmarsch: dm >= 0 ? dm : null, amount, payouts, breakdown };
}

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
  kontra?: boolean;
  re?: boolean;
  bock?: number;
}): PlayedResult {
  const { contract, declarer, partner, declarerPoints, declarerTricks, initialHands } = args;
  const tarif = args.tarif ?? DEFAULT_TARIF;
  const declarerTeam = partner === null ? [declarer] : [declarer, partner];
  const opponentPoints = 120 - declarerPoints;
  const bettel = contract.kind === 'bettel';
  const tout = isTout(contract) || contract.kind === 'sie';
  const declarerWon = bettel ? declarerTricks === 0 : tout ? declarerTricks === 8 : declarerPoints >= 61;
  const loserPoints = declarerWon ? opponentPoints : declarerPoints;
  const loserTricks = declarerWon ? 8 - declarerTricks : declarerTricks;
  // Bei Bettel und Tout gibt es kein Schneider/Schwarz extra (Sie zählt wie Tout mit allem).
  const schneider = contract.kind === 'sie' || (!bettel && !tout && loserPoints <= 30);
  const schwarz = contract.kind === 'sie' || (!bettel && !tout && loserTricks === 0);
  const laufende = bettel ? 0 : countLaufende(contract, initialHands, declarerTeam);

  const breakdown: string[] = [];
  const base = isSoloLike(contract) ? tarif.solo : tarif.sauspiel;
  breakdown.push(`${contract.kind === 'sauspiel' ? 'Sauspiel' : contractName({ ...contract, tout: false } as Contract)}: ${base}`);
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
  if (bettel && 'brett' in contract && contract.brett) {
    amount *= 2;
    breakdown.push('Brett: ×2');
  }
  if (tout) {
    amount *= 2;
    breakdown.push(`${contract.kind === 'sie' ? 'Sie' : 'Tout'}: ×2`);
  }
  // Kontra und Re verdoppeln jeweils den ganzen Spielwert.
  if (args.kontra) {
    amount *= 2;
    breakdown.push('Kontra: ×2');
  }
  if (args.kontra && args.re) {
    amount *= 2;
    breakdown.push('Re: ×2');
  }
  const bock = args.bock ?? 1;
  if (bock > 1) {
    amount *= bock;
    breakdown.push(`Bock: ×${bock}`);
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
    kontra: !!args.kontra,
    re: !!(args.kontra && args.re),
    bock,
    amount,
    payouts,
    breakdown,
  };
}
