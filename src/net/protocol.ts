import type { Action, GameState } from '../engine';

/** Nachrichten zwischen App und Online-Server (JSON über WebSocket). */
export type ClientMsg =
  | { t: 'create'; name: string }
  | { t: 'join'; code: string; name: string }
  | { t: 'start' }
  | { t: 'action'; action: Action }
  | { t: 'next' }
  | { t: 'leave' };

export interface SeatInfo {
  name: string;
  bot: boolean;
  connected: boolean;
}

export interface RoomView {
  code: string;
  you: number;
  host: number;
  seats: SeatInfo[];
  started: boolean;
  gameNo: number;
  totals: number[];
  ready: boolean[];
  game: GameState | null;
}

export type ServerMsg = { t: 'room'; room: RoomView } | { t: 'error'; message: string };

export const BOT_NAMES = ['Sepp', 'Resi', 'Franz', 'Vroni'];
