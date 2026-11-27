import { readFileSync } from 'fs';
import { Action, GameState, StrongOptions, chooseStrongAction, chooseAction } from '../src/engine';
import { chooseMegaAction } from '../src/engine/mega';
import { MegaNet } from '../src/engine/mega/net';

export type Player = (s: GameState, p: number, opts: StrongOptions) => Action;

/** "strong", "normal", "mega:<netz.json>:<mix>", "net:<netz.json>" (nur Netz). */
export function megaPlayer(spec: string): Player {
  const [kind, file, mixArg, rollFile] = spec.split(':');
  if (kind === 'app') {
    // MEGA genau wie in der App (eingebaute Netze); MEGA_SAMPLES simuliert langsamere Geräte.
    const n = process.env.MEGA_SAMPLES ? Number(process.env.MEGA_SAMPLES) : undefined;
    return (s, p, o) => chooseMegaAction(s, p, n ? { ...o, samples: n } : o);
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
