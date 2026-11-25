import { afterEach, describe, expect, it, vi } from 'vitest';
import { Room } from './rooms';
import { HIDDEN } from '../src/engine';
import type { RoomView } from '../src/net/protocol';

afterEach(() => vi.useRealTimers());

describe('Online-Tisch', () => {
  it('Spieler sieht nur die eigene Hand, Computer spielen die anderen Plätze', () => {
    vi.useFakeTimers();
    const views: RoomView[] = [];
    const room = new Room('TEST');
    const seat = room.join('Till', { send: (v) => views.push(v as RoomView) }) as number;
    expect(seat).toBe(0);
    room.start(seat);
    const v = views[views.length - 1];
    expect(v.game!.hands[0].every((c) => c !== HIDDEN)).toBe(true);
    expect(v.game!.hands[1].every((c) => c === HIDDEN)).toBe(true);
    expect(v.game!.initialHands[2]).toEqual([]);
  });

  it('Spieler mit getrennter Verbindung bekommt seinen Platz zurück', () => {
    const room = new Room('TEST');
    room.join('Till', { send: () => {} });
    const b = room.join('Max', { send: () => {} });
    room.leave(b as number, false);
    expect(room.join('Max', { send: () => {} })).toBe(b);
    expect(room.join('Anna', { send: () => {} })).toBe(2);
  });

  it('ein Spiel nur mit Computern läuft bis zum Ende durch', () => {
    vi.useFakeTimers();
    const room = new Room('TEST');
    const seat = room.join('Till', { send: () => {} }) as number;
    room.leave(seat, false); // Computer übernimmt
    room.started = false;
    room.host = seat;
    room.start(seat);
    for (let i = 0; i < 200 && room.game?.phase !== 'finished'; i++) vi.advanceTimersByTime(2000);
    expect(room.game?.phase).toBe('finished');
  });
});
