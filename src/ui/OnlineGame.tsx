import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ImageBackground, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Action } from '../engine';
import { SERVER_URL } from '../net/config';
import { ClientMsg, RoomView, ServerMsg } from '../net/protocol';
import { GameTable } from './GameTable';
import { COLORS } from './theme';

type Mode = { kind: 'create' } | { kind: 'join'; code: string };

/** Online-Tisch: Verbindung zum Server, Warteraum und Spiel. */
export function OnlineGame({ name, mode, onExit }: { name: string; mode: Mode; onExit: () => void }) {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const codeRef = useRef<string | null>(mode.kind === 'join' ? mode.code : null);
  const closedByUs = useRef(false);

  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const connect = () => {
      const sock = new WebSocket(SERVER_URL);
      ws.current = sock;
      sock.onopen = () => {
        attempts = 0;
        setConnected(true);
        // Nach Verbindungsabbruch automatisch wieder an den gleichen Tisch.
        const msg: ClientMsg = codeRef.current ? { t: 'join', code: codeRef.current, name } : { t: 'create', name };
        sock.send(JSON.stringify(msg));
      };
      sock.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMsg;
        if (msg.t === 'room') {
          codeRef.current = msg.room.code;
          setRoom(msg.room);
          setError(null);
        } else {
          setError(msg.message);
        }
      };
      sock.onclose = () => {
        setConnected(false);
        if (closedByUs.current) return;
        attempts++;
        retry = setTimeout(connect, Math.min(8000, 1000 * attempts));
      };
    };
    connect();
    return () => {
      closedByUs.current = true;
      if (retry) clearTimeout(retry);
      try {
        ws.current?.send(JSON.stringify({ t: 'leave' } satisfies ClientMsg));
      } catch {
        /* egal */
      }
      ws.current?.close();
    };
  }, []);

  const send = (m: ClientMsg) => ws.current?.readyState === 1 && ws.current.send(JSON.stringify(m));

  if (!room) {
    return (
      <Screen>
        {error ? (
          <>
            <Text style={styles.big}>Das hat nicht geklappt</Text>
            <Text style={styles.text}>{error}</Text>
          </>
        ) : (
          <>
            <ActivityIndicator color={COLORS.accent} size="large" />
            <Text style={styles.text}>{connected ? 'Tisch wird vorbereitet …' : 'Verbinde mit dem Server …'}</Text>
            {!connected && <Text style={styles.small}>Beim ersten Mal kann das bis zu einer Minute dauern.</Text>}
          </>
        )}
        <Pressable style={styles.ghost} onPress={onExit}>
          <Text style={styles.ghostText}>Zurück zum Menü</Text>
        </Pressable>
      </Screen>
    );
  }

  const names = room.seats.map((s, i) => (i === room.you ? s.name : s.bot ? `${s.name} (PC)` : s.connected ? s.name : `${s.name} (weg)`));

  if (!room.started || !room.game) {
    const isHost = room.host === room.you;
    const link = Platform.OS === 'web' && typeof location !== 'undefined' ? `${location.origin}${location.pathname}?tisch=${room.code}` : null;
    return (
      <Screen>
        <Text style={styles.text}>Euer Tisch-Code</Text>
        <Text style={styles.code} testID="room-code">{room.code}</Text>
        <Text style={styles.small}>Schick deinen Freunden den Code{link ? ' oder diesen Link' : ''}.</Text>
        {link && <Text selectable style={styles.link}>{link}</Text>}
        <View style={styles.seats}>
          {room.seats.map((s, i) => (
            <View key={i} style={styles.seatRow}>
              <Text style={styles.seatName}>
                {s.bot ? 'Freier Platz' : s.name}
                {i === room.you ? ' (du)' : ''}
              </Text>
              <Text style={styles.seatState}>{s.bot ? 'spielt der Computer' : i === room.host ? 'Gastgeber' : 'dabei'}</Text>
            </View>
          ))}
        </View>
        {isHost ? (
          <Pressable style={styles.btn} onPress={() => send({ t: 'start' })} testID="start">
            <Text style={styles.btnText}>Spiel starten</Text>
          </Pressable>
        ) : (
          <Text style={styles.text}>Warte, bis {room.seats[room.host].name} das Spiel startet …</Text>
        )}
        <Pressable style={styles.ghost} onPress={onExit}>
          <Text style={styles.ghostText}>Tisch verlassen</Text>
        </Pressable>
      </Screen>
    );
  }

  const waitingFor = room.seats
    .map((s, i) => (!s.bot && s.connected && !room.ready[i] && i !== room.you ? s.name : null))
    .filter(Boolean);
  const meReady = room.ready[room.you];

  return (
    <View style={{ flex: 1 }}>
      <GameTable
        game={room.game}
        me={room.you}
        names={names}
        totals={room.totals}
        gameNo={room.gameNo}
        onAction={(a: Action) => send({ t: 'action', action: a })}
        onNext={() => send({ t: 'next' })}
        nextDisabled={meReady}
        nextHint={meReady && waitingFor.length ? `Warte auf ${waitingFor.join(', ')} …` : undefined}
        onExit={onExit}
        topRight={<Text style={styles.headerCode}>Tisch {room.code}{connected ? '' : ' · getrennt'}</Text>}
      />
      {error && (
        <Pressable style={styles.toast} onPress={() => setError(null)}>
          <Text style={styles.toastText}>{error}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ImageBackground source={require('../../assets/images/holz.jpg')} resizeMode="cover" style={styles.root}>
      <View style={styles.panel}>{children}</View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#2a1810' },
  panel: { width: '100%', maxWidth: 380, backgroundColor: 'rgba(18,9,4,0.8)', borderRadius: 14, padding: 20, gap: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(242,193,78,0.3)' },
  big: { color: COLORS.text, fontSize: 20, fontWeight: '800' },
  text: { color: COLORS.text, fontSize: 15, textAlign: 'center' },
  small: { color: COLORS.muted, fontSize: 13, textAlign: 'center' },
  code: { color: COLORS.accent, fontSize: 48, fontWeight: '800', letterSpacing: 8, fontFamily: 'Georgia, serif' },
  link: { color: COLORS.text, fontSize: 12, textAlign: 'center' },
  seats: { width: '100%', gap: 6, marginVertical: 6 },
  seatRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', paddingVertical: 6 },
  seatName: { color: COLORS.text, fontWeight: '700' },
  seatState: { color: COLORS.muted },
  btn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12, alignSelf: 'stretch', alignItems: 'center' },
  btnText: { color: '#1b1b1b', fontWeight: '800', fontSize: 16 },
  ghost: { paddingVertical: 8 },
  ghostText: { color: COLORS.muted, textDecorationLine: 'underline' },
  headerCode: { color: COLORS.muted, fontSize: 12 },
  toast: { position: 'absolute', top: 80, alignSelf: 'center', backgroundColor: '#7a1f1f', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, maxWidth: 360 },
  toastText: { color: '#fff' },
});
