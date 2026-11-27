import { Action, GameState } from './game';
import { chooseAction as chooseNormal } from './ai';
import { StrongOptions, chooseStrongAction } from './strong';
import { chooseMegaAction } from './mega';

export type BotLevel = 'normal' | 'strong' | 'mega';

export const BOT_LEVELS: { level: BotLevel; label: string }[] = [
  { level: 'normal', label: 'Normal' },
  { level: 'strong', label: 'Sehr stark' },
  { level: 'mega', label: 'MEGA' },
];

export const isBotLevel = (x: unknown): x is BotLevel => BOT_LEVELS.some((l) => l.level === x);

/** Zug eines Computergegners in der gewählten Schwierigkeit. */
export function chooseBotAction(s: GameState, player: number, level: BotLevel = 'normal', opts?: StrongOptions): Action {
  if (level === 'mega') return chooseMegaAction(s, player, opts);
  return level === 'strong' ? chooseStrongAction(s, player, opts) : chooseNormal(s, player);
}
