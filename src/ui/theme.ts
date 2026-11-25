import { Suit } from '../engine';

export const SUIT_SYMBOL: Record<Suit, string> = { E: '🌰', G: '🍀', H: '❤️', S: '🔔' };
export const SUIT_COLOR: Record<Suit, string> = {
  E: '#6d4219',
  G: '#2e7d32',
  H: '#c62828',
  S: '#b07d00',
};
export const COLORS = {
  table: '#1f5f3b',
  tableDark: '#164a2d',
  text: '#f4f1e8',
  muted: '#d9c4a3',
  accent: '#f2c14e',
  card: '#fffdf6',
  panel: '#0f3a22',
};

export const PLAYER_NAMES = ['Du', 'Sepp', 'Resi', 'Franz'];

export const euro = (cents: number): string => {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return `${sign}${(Math.abs(cents) / 100).toFixed(2).replace('.', ',')} €`;
};
