import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../src/net/protocol';
import { Room, makeCode } from './rooms';
import { normalizeRules } from '../src/engine/options';

/** Online-Server für Schafkopf: WebSocket, Tische mit 4-stelligem Code. */
const PORT = Number(process.env.PORT ?? 8787);
const ROOM_IDLE_MS = 30 * 60 * 1000;
const rooms = new Map<string, Room>();

const http = createServer((req, res) => {
  // Für Health-Checks des Hosters.
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`Schafkopf-Server läuft. Tische: ${rooms.size}\n`);
});

const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });

wss.on('connection', (ws: WebSocket) => {
  let room: Room | null = null;
  let seat = -1;
  const send = (m: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
  const client = { send: (v: any) => send({ t: 'room', room: v }) };
  const error = (message: string) => send({ t: 'error', message });

  const sit = (r: Room, name: string) => {
    const res = r.join(name, client);
    if (typeof res === 'string') return error(res);
    room = r;
    seat = res;
    r.broadcast();
  };

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return error('Ungültige Nachricht');
    }
    switch (msg.t) {
      case 'create': {
        if (room) return;
        const code = makeCode((c) => rooms.has(c));
        const r = new Room(code, normalizeRules(msg.rules));
        rooms.set(code, r);
        return sit(r, String(msg.name ?? ''));
      }
      case 'join': {
        if (room) return;
        const r = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!r) return error('Diesen Tisch gibt es nicht. Stimmt der Code?');
        return sit(r, String(msg.name ?? ''));
      }
      case 'start':
        return room?.start(seat);
      case 'action': {
        if (!room) return;
        const err = room.act(seat, msg.action);
        if (err) error(err);
        return;
      }
      case 'next':
        return room?.nextGame(seat);
      case 'leave':
        room?.leave(seat, true);
        room?.broadcast();
        room = null;
        return;
    }
  });

  ws.on('close', () => {
    if (!room) return;
    room.leave(seat, false);
    room.broadcast();
  });
});

// Leere Tische aufräumen.
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (r.humansConnected === 0 && now - r.lastActivity > ROOM_IDLE_MS) {
      r.dispose();
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

http.listen(PORT, () => console.log(`Schafkopf-Server auf Port ${PORT}`));
