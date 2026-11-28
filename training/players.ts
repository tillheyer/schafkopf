import { readFileSync } from 'fs';
import { Action, GameState, StrongOptions, chooseStrongAction, chooseAction, canKontra, canRe } from '../src/engine';
import { chooseMegaAction } from '../src/engine/mega';
import { MegaNet } from '../src/engine/mega/net';
import { chooseMegaAction as chooseOldMega } from '../../old/src/engine/mega';

export type Player = (s: GameState, p: number, opts: StrongOptions) => Action;

/** "strong", "normal", "mega:<netz.json>:<mix>", "net:<netz.json>" (nur Netz). */
export function megaPlayer(spec: string): Player {
  const [kind, file, mixArg, rollFile] = spec.split(':');
  if (kind === 'app') {
    // MEGA genau wie in der App (eingebaute Netze); MEGA_SAMPLES simuliert langsamere Geräte.
    const n = process.env.MEGA_SAMPLES ? Number(process.env.MEGA_SAMPLES) : undefined;
    return (s, p, o) => chooseMegaAction(s, p, n ? { ...o, samples: n } : o);
  }
  // Der bisher veröffentlichte MEGA-Stand (aus einem zweiten Arbeitsverzeichnis).
  if (kind === 'old') return (s, p, o) => chooseOldMega(s, p, o);
  // Neuer Stand mit Einstellungen: "new:key=wert,key=wert" (net, roll, mix, kontraAt, reAt, bidS, bidO).
  if (kind === 'new') {
    const kv = Object.fromEntries((file ?? '').split(',').filter(Boolean).map((x) => x.split('=')));
    const load = (f?: string) => (f ? new MegaNet(JSON.parse(readFileSync(f, 'utf8'))) : undefined);
    const net = load(kv.net);
    const rolloutNet = load(kv.roll);
    const num = (k: string) => (kv[k] !== undefined ? Number(kv[k]) : undefined);
    const bidMargin = kv.bidS !== undefined ? { sauspiel: num('bidS')!, other: num('bidO')! } : undefined;
    const kontraOld = kv.kontra === 'old';
    const bidsOld = kv.bids === 'old';
    return (s, p, o) => {
      if (bidsOld && s.phase === 'bidding') return chooseOldMega(s, p, o);
      if (kontraOld && s.phase === 'playing' && (canKontra(s, p) || canRe(s, p))) {
        const a = chooseOldMega(s, p, o);
        if (a.type !== 'play') return a;
        o = { ...o, kontra: () => false, re: () => false };
      }
      return chooseMegaAction(s, p, {
        mix: num('mix'),
        kontraAt: num('kontraAt'),
        reAt: num('reAt'),
        bidMargin,
        ...o,
        net,
        rolloutNet: rolloutNet ?? undefined,
      });
    };
  }
  if (kind === 'strong') return (s, p, o) => chooseStrongAction(s, p, o);
  if (kind === 'normal') return (s, p) => chooseAction(s, p);
  const net = new MegaNet(JSON.parse(readFileSync(file, 'utf8')));
  if (kind === 'net') return (s, p, o) => chooseMegaAction(s, p, { ...o, net, netOnly: true });
  const mix = mixArg ? Number(mixArg) : undefined;
  const rolloutNet = rollFile ? new MegaNet(JSON.parse(readFileSync(rollFile, 'utf8'))) : undefined;
  if (kind === 'megar') return (s, p, o) => chooseMegaAction(s, p, { ...o, net, mix, netRollouts: true, rolloutNet });
  return (s, p, o) => chooseMegaAction(s, p, { ...o, net, mix, netRollouts: false });
}
