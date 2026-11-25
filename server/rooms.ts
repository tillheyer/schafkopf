import {
  Action,
  GameState,
  applyAction,
  chooseAction,
  createRng,
  newGame,
  next,
  redactFor,
} from '../src/engine';
import { BOT_NAMES, RoomView, SeatInfo } from '../src/net/protocol';

/**
 * Ein Tisch mit 4 Plätzen. Der Server ist die einzige Quelle der Wahrheit:
 * er prüft jede Aktion mit der Spiellogik und schickt jedem nur seine Sicht.
 */
export interface Client {
  send(view: RoomView | { error: string }): void;
}

interface Seat extends SeatInfo {
  client: Client | null;
}

const BOT_DELAY = 800;
const AFTER_TRICK_DELAY = 1800;

export class Room {
  seats: Seat[] = [];
  host = 0;
  started = false;
  gameNo = 0;
  totals = [0, 0, 0, 0];
  ready = [false, false, false, false];
  game: GameState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dealer = 3;
  lastActivity = Date.now();

  constructor(public code: string) {
    for (let i = 0; i < 4; i++) this.seats.push({ name: BOT_NAMES[i], bot: true, connected: false, client: null });
  }

  /** Spieler setzt sich: freien (Computer-)Platz oder eigenen alten Platz nach Verbindungsabbruch. */
  join(name: string, client: Client): number | string {
    const clean = name.trim().slice(0, 16) || 'Gast';
    let seat = this.seats.findIndex((s) => !s.bot && !s.connected && s.name === clean);
    if (seat < 0) seat = this.seats.findIndex((s) => s.bot);
    if (seat < 0) return 'Der Tisch ist voll.';
    const taken = this.seats.some((s, i) => i !== seat && !s.bot && s.name === clean);
    this.seats[seat] = { name: taken ? `${clean} ${seat + 1}` : clean, bot: false, connected: true, client };
    if (!this.seats.some((s, i) => i !== seat && !s.bot && s.connected)) this.host = seat;
    this.touch();
    this.scheduleBot();
    return seat;
  }

  leave(seat: number, permanently: boolean) {
    const s = this.seats[seat];
    if (!s || s.bot) return;
    s.client = null;
    s.connected = false;
    if (permanently) Object.assign(s, { name: BOT_NAMES[seat], bot: true });
    if (this.host === seat) {
      const other = this.seats.findIndex((x) => !x.bot && x.connected);
      if (other >= 0) this.host = other;
    }
    // Wer fehlt, gilt für das nächste Spiel als bereit.
    this.ready[seat] = this.game?.phase === 'finished';
    this.touch();
    this.scheduleBot();
    if (this.game?.phase === 'finished' && !this.seats.some((x, i) => !x.bot && x.connected && !this.ready[i]) && this.humansConnected > 0) {
      this.newGame();
    }
  }

  get humansConnected() {
    return this.seats.filter((s) => !s.bot && s.connected).length;
  }

  start(seat: number) {
    if (seat !== this.host || this.started) return;
    this.started = true;
    this.newGame();
  }

  act(seat: number, action: Action): string | null {
    if (!this.game) return 'Das Spiel hat noch nicht begonnen.';
    try {
      this.game = applyAction(this.game, { ...action, player: seat } as Action);
    } catch (e) {
      return (e as Error).message;
    }
    this.afterChange();
    return null;
  }

  nextGame(seat: number) {
    if (this.game?.phase !== 'finished') return;
    this.ready[seat] = true;
    this.touch();
    const waiting = this.seats.some((s, i) => !s.bot && s.connected && !this.ready[i]);
    if (!waiting) this.newGame();
    else this.broadcast();
  }

  private newGame() {
    const r = this.game?.result;
    if (r?.kind === 'played') this.totals = this.totals.map((t, i) => t + r.payouts[i]);
    if (this.game) this.dealer = next(this.dealer);
    this.gameNo++;
    this.ready = [false, false, false, false];
    this.game = newGame(this.dealer, createRng(Date.now() ^ (this.gameNo * 7919)));
    this.afterChange();
  }

  private afterChange() {
    this.touch();
    this.broadcast();
    this.scheduleBot();
  }

  /** Computer zieht für Computer-Plätze und für Spieler ohne Verbindung. */
  private scheduleBot() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const g = this.game;
    if (!g || g.phase === 'finished') return;
    const seat = this.seats[g.turn];
    if (!seat.bot && seat.connected) return;
    const afterTrick = g.phase === 'playing' && g.tricks.length > 0 && g.current?.cards.length === 0;
    this.timer = setTimeout(() => {
      if (this.game !== g) return;
      this.game = applyAction(g, chooseAction(g, g.turn));
      this.afterChange();
    }, afterTrick ? AFTER_TRICK_DELAY : BOT_DELAY);
  }

  view(seat: number): RoomView {
    return {
      code: this.code,
      you: seat,
      host: this.host,
      seats: this.seats.map(({ name, bot, connected }) => ({ name, bot, connected })),
      started: this.started,
      gameNo: this.gameNo,
      totals: this.totals,
      ready: this.ready,
      game: this.game ? redactFor(this.game, seat) : null,
    };
  }

  broadcast() {
    this.seats.forEach((s, i) => s.client?.send(this.view(i)));
  }

  touch() {
    this.lastActivity = Date.now();
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer);
  }
}

/** Tisch-Codes ohne leicht verwechselbare Zeichen. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeCode(exists: (c: string) => boolean): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!exists(c)) return c;
  }
}
