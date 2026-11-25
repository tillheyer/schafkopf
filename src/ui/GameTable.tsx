import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  Action,
  CardId,
  Contract,
  GameState,
  Trick,
  contractName,
  legalBids,
  legalCards,
  suitOf,
  suitPower,
  trumpPower,
  SUIT_NAMES,
} from '../engine';
import { CardBack, CardView } from './CardView';
import { COLORS, euro } from './theme';

const TRICK_PAUSE = 1300;
const SIDE_W = 60;

export interface GameTableProps {
  game: GameState;
  /** Eigener Platz (0..3); wird unten angezeigt. */
  me: number;
  names: string[];
  totals: number[];
  gameNo: number;
  onAction: (a: Action) => void;
  onNext: () => void;
  /** Zusatz unter dem Ergebnis, z.B. "Warte auf Resi …" */
  nextHint?: string;
  nextDisabled?: boolean;
  /** Kopfzeile rechts, z.B. Tisch-Code und Verlassen. */
  topRight?: React.ReactNode;
  onExit?: () => void;
  offline?: boolean;
}

/** Hand sortieren: Trümpfe zuerst (stärkste links), dann Farben. */
function sortHand(hand: CardId[], c: Contract): CardId[] {
  const suitOrder = ['E', 'G', 'H', 'S'];
  return [...hand].sort((a, b) => {
    const ta = trumpPower(a, c);
    const tb = trumpPower(b, c);
    if (ta >= 0 || tb >= 0) return tb - ta;
    if (suitOf(a) !== suitOf(b)) return suitOrder.indexOf(suitOf(a)) - suitOrder.indexOf(suitOf(b));
    return suitPower(b, c) - suitPower(a, c);
  });
}

export function bidLabel(b: Contract | null): string {
  if (!b) return 'Weiter';
  if (b.kind === 'sauspiel') return `Sauspiel auf die ${SUIT_NAMES[b.suit]}-Sau`;
  if (b.kind === 'wenz') return 'Wenz';
  return `${SUIT_NAMES[b.suit]}-Solo`;
}

export function GameTable(props: GameTableProps) {
  const { game, me, names, totals, gameNo, onAction } = props;
  const [shownTrick, setShownTrick] = useState<Trick | null>(null);
  const [showLast, setShowLast] = useState(false);
  const { width, height } = useWindowDimensions();
  const prevTricks = useRef(game.tricks.length);
  const prevGameNo = useRef(gameNo);

  const who = (p: number) => (p === me ? 'Du' : names[p]);
  const verb = (p: number, du: string, er: string) => (p === me ? du : er);

  // Neues Spiel: Anzeige zurücksetzen.
  useEffect(() => {
    if (gameNo !== prevGameNo.current) {
      prevGameNo.current = gameNo;
      prevTricks.current = 0;
      setShownTrick(null);
      setShowLast(false);
    }
  }, [gameNo]);

  // Abgeschlossenen Stich kurz stehen lassen.
  useEffect(() => {
    if (game.tricks.length > prevTricks.current) {
      prevTricks.current = game.tricks.length;
      setShownTrick(game.tricks[game.tricks.length - 1]);
      const t = setTimeout(() => setShownTrick(null), TRICK_PAUSE);
      return () => clearTimeout(t);
    }
    prevTricks.current = game.tricks.length;
  }, [game.tricks.length]);

  const sortContract: Contract = game.contract ?? { kind: 'sauspiel', suit: 'E' };
  const hand = useMemo(() => sortHand(game.hands[me], sortContract), [game.hands, game.contract, me]);
  const legal = !shownTrick ? legalCards(game, me) : [];
  // Eigene Hand groß und überlappend, damit die Ecken lesbar bleiben.
  const handAvail = Math.min(width, 640) - 16;
  const handW = Math.max(48, Math.min(120, Math.floor(handAvail / 4.2), Math.floor((height - 520) / 1.5)));
  // Stich in der Mitte so groß, wie Breite und Höhe es zulassen.
  const tableCardW = Math.max(48, Math.min(120, Math.floor((Math.min(width, 640) - 16 - 2 * SIDE_W) / 2.6), Math.floor((height - 300 - handW * 1.5) / 3.45)));
  const handN = Math.max(1, hand.length);
  const overlap = Math.max(0, Math.ceil((handN * handW - handAvail) / Math.max(1, handN - 1)));
  const myTurn = game.turn === me && game.phase !== 'finished';

  const tableTrick: Trick | null =
    showLast && game.tricks.length ? game.tricks[game.tricks.length - 1] : shownTrick ?? game.current;

  const status = (() => {
    if (game.phase === 'bidding') {
      return myTurn ? 'Du bist dran: Was spielst du?' : `${names[game.turn]} überlegt …`;
    }
    if (game.phase === 'playing') {
      if (shownTrick) return `${who(shownTrick.winner!)} ${verb(shownTrick.winner!, 'machst', 'macht')} den Stich`;
      return myTurn ? 'Du bist dran' : `${names[game.turn]} ist dran`;
    }
    return '';
  })();

  const announcement =
    game.contract && game.declarer !== null
      ? `${who(game.declarer)} ${verb(game.declarer, 'spielst', 'spielt')} ${contractName(game.contract)}`
      : `Spiel ${gameNo} · ${who(game.dealer)} ${verb(game.dealer, 'gibst', 'gibt')}`;

  // Sitzposition relativ zu mir: 0 unten, 1 links, 2 oben, 3 rechts.
  const at = (rel: number) => (me + rel) % 4;

  return (
    <ImageBackground source={require('../../assets/images/holz.jpg')} resizeMode="cover" style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {props.onExit && (
            <Pressable onPress={props.onExit} hitSlop={10} testID="exit">
              <Text style={styles.exit}>‹ Menü</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.title}>Schafkopf</Text>
        <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{props.topRight}</View>
      </View>
      <Text style={styles.announce} testID="announcement">
        {announcement}
      </Text>

      <View style={styles.table}>
        <Seat player={at(2)} game={game} names={names} style={styles.seatTop} cardW={22} />
        <View style={styles.middleRow}>
          <Seat player={at(1)} game={game} names={names} style={styles.seatSide} cardW={18} />
          <TrickArea trick={tableTrick} cardW={tableCardW} me={me} />
          <Seat player={at(3)} game={game} names={names} style={styles.seatSide} cardW={18} />
        </View>
        <Text style={styles.status} testID="status">
          {status}
        </Text>
        {game.phase === 'playing' && game.tricks.length > 0 && !shownTrick && (
          <Pressable onPress={() => setShowLast((v) => !v)} style={styles.lastBtn}>
            <Text style={styles.lastBtnText}>{showLast ? 'Zurück zum Spiel' : 'Letzten Stich zeigen'}</Text>
          </Pressable>
        )}
      </View>

      {game.phase === 'bidding' && myTurn && (
        <BidPanel game={game} me={me} onBid={(c) => onAction({ type: 'bid', player: me, contract: c })} />
      )}

      <View style={styles.handArea}>
        <Text style={styles.you}>
          {names[me]}
          {game.declarer === me ? ' · Spieler' : ''} · Stiche: {game.tricks.filter((t) => t.winner === me).length}
        </Text>
        <View style={styles.hand}>
          {hand.map((c, i) => (
            <View key={c} style={{ marginLeft: i === 0 ? 0 : overlap > 0 ? -overlap : 4 }}>
            <CardView
              card={c}
              width={handW}
              enabled={legal.includes(c) && !showLast}
              dimmed={game.phase === 'playing' && myTurn && !shownTrick && !legal.includes(c)}
              highlight={game.phase === 'playing' && myTurn && legal.includes(c) && !shownTrick}
              onPress={() => onAction({ type: 'play', player: me, card: c })}
            />
            </View>
          ))}
        </View>
        <View style={styles.totals}>
          {names.map((n, i) => (
            <Text key={i} style={styles.total}>
              {n}: {euro(totals[i])}
            </Text>
          ))}
        </View>
      </View>

      {game.phase === 'finished' && !shownTrick && <ResultPanel {...props} />}
    </ImageBackground>
  );
}

function Seat({ player, game, names, style, cardW }: { player: number; game: GameState; names: string[]; style: object; cardW: number }) {
  const bid = game.bids.find((b) => b.player === player);
  const tricks = game.tricks.filter((t) => t.winner === player).length;
  const active = game.turn === player && game.phase !== 'finished';
  return (
    <View style={[styles.seat, style]}>
      <Text style={[styles.seatName, active && { color: COLORS.accent }]} numberOfLines={1}>
        {names[player]}
      </Text>
      {game.dealer === player && <Text style={styles.dealer}>gibt</Text>}
      {game.phase === 'bidding' && bid && <Text style={styles.bid}>{bidLabel(bid.contract)}</Text>}
      {game.phase !== 'bidding' && game.declarer === player && <Text style={styles.badge}>Spieler</Text>}
      <View style={styles.backs}>
        {game.hands[player].map((_, i) => (
          <View key={i} style={{ marginLeft: i === 0 ? 0 : -cardW * 0.72 }}>
            <CardBack width={cardW} />
          </View>
        ))}
      </View>
      {game.phase !== 'bidding' && <Text style={styles.seatInfo}>Stiche: {tricks}</Text>}
    </View>
  );
}

function TrickArea({ trick, cardW, me }: { trick: Trick | null; cardW: number; me: number }) {
  const slot = (rel: number) => {
    if (!trick) return null;
    const player = (me + rel) % 4;
    const idx = (player - trick.leader + 4) % 4;
    const card = trick.cards[idx];
    return card ? <CardView card={card} width={cardW} highlight={trick.winner === player} /> : null;
  };
  const h = cardW * 1.5;
  return (
    <View style={[styles.trick, { width: cardW * 2.6, height: h * 2.3 }]} testID="trick">
      <View style={{ position: 'absolute', top: 0, alignSelf: 'center' }}>{slot(2)}</View>
      <View style={{ position: 'absolute', left: 0, top: h * 0.65 }}>{slot(1)}</View>
      <View style={{ position: 'absolute', right: 0, top: h * 0.65 }}>{slot(3)}</View>
      <View style={{ position: 'absolute', bottom: 0, alignSelf: 'center' }}>{slot(0)}</View>
    </View>
  );
}

function BidPanel({ game, me, onBid }: { game: GameState; me: number; onBid: (c: Contract | null) => void }) {
  const bids = legalBids(game, me);
  return (
    <View style={styles.bidPanel}>
      <Text style={styles.panelTitle}>Deine Ansage</Text>
      <ScrollView contentContainerStyle={styles.bidButtons}>
        {bids.map((b) => (
          <Pressable
            key={bidLabel(b)}
            onPress={() => onBid(b)}
            style={({ pressed }) => [styles.bidBtn, !b && styles.passBtn, pressed && { opacity: 0.7 }]}
            testID={`bid-${bidLabel(b)}`}
          >
            <Text style={[styles.bidBtnText, !b && { color: COLORS.text }]}>{bidLabel(b)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function ResultPanel({ game, me, names, onNext, nextHint, nextDisabled }: GameTableProps) {
  const r = game.result!;
  let body: React.ReactNode;
  if (r.kind === 'zamgeworfen') {
    body = <Text style={styles.resultLine}>Alle haben „weiter“ gesagt. Die Karten werden neu gegeben.</Text>;
  } else {
    const team = r.declarerTeam.map((p) => (p === me ? 'Du' : names[p])).join(' und ');
    const won = r.payouts[me] > 0;
    body = (
      <>
        <Text style={[styles.resultHead, { color: won ? COLORS.accent : COLORS.text }]}>{won ? 'Gewonnen!' : 'Verloren'}</Text>
        <Text style={styles.resultLine}>
          {contractName(r.contract)}: {team} {r.declarerTeam.length > 1 ? 'habt' : r.declarer === me ? 'hast' : 'hat'}{' '}
          {r.declarerPoints} Augen und {r.declarerWon ? 'gewonnen' : 'verloren'}.
        </Text>
        {r.partner !== null && <Text style={styles.resultLine}>Mitspieler mit der Sau: {names[r.partner]}</Text>}
        <Text style={styles.resultLine}>Gegenspieler: {r.opponentPoints} Augen</Text>
        <Text style={styles.resultSmall}>
          {r.breakdown.join(' · ')} = {r.amount} Cent
        </Text>
        <View style={{ marginTop: 8 }}>
          {r.payouts.map((p, i) => (
            <Text key={i} style={styles.resultLine}>
              {names[i]}: {euro(p)}
            </Text>
          ))}
        </View>
      </>
    );
  }
  return (
    <View style={styles.overlay}>
      <View style={styles.resultPanel} testID="result">
        {body}
        <Pressable onPress={onNext} disabled={nextDisabled} style={[styles.nextBtn, nextDisabled && { opacity: 0.5 }]} testID="next-game">
          <Text style={styles.nextBtnText}>Nächstes Spiel</Text>
        </Pressable>
        {nextHint ? <Text style={[styles.resultSmall, { textAlign: 'center' }]}>{nextHint}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#2a1810', paddingTop: 36 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  headerSide: { flex: 1 },
  exit: { color: COLORS.muted, fontSize: 15 },
  title: { color: COLORS.accent, fontSize: 24, fontWeight: '800', letterSpacing: 1, fontFamily: 'Georgia, serif', textShadowColor: '#000', textShadowRadius: 4 },
  announce: { color: COLORS.text, fontSize: 14, marginTop: 2, textAlign: 'center', paddingHorizontal: 16 },
  table: { flex: 1, justifyContent: 'center', paddingHorizontal: 8, width: '100%', maxWidth: 640, alignSelf: 'center' },
  middleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seat: { alignItems: 'center' },
  seatTop: { marginBottom: 6 },
  seatSide: { width: SIDE_W },
  seatName: { color: COLORS.text, fontWeight: '700', fontSize: 13, maxWidth: 120, textAlign: 'center' },
  dealer: { color: COLORS.muted, fontSize: 11, fontStyle: 'italic' },
  seatInfo: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  bid: { color: COLORS.accent, fontSize: 12, textAlign: 'center', marginVertical: 2 },
  badge: { color: '#1b1b1b', backgroundColor: COLORS.accent, fontSize: 11, paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden', marginVertical: 2 },
  backs: { flexDirection: 'row', marginTop: 4 },
  trick: { position: 'relative' },
  status: { color: COLORS.text, textAlign: 'center', marginTop: 6, fontSize: 15, fontWeight: '600' },
  lastBtn: { alignSelf: 'center', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4 },
  lastBtnText: { color: COLORS.muted, fontSize: 13, textDecorationLine: 'underline' },
  handArea: { backgroundColor: 'rgba(12,6,3,0.55)', borderTopWidth: 1, borderTopColor: 'rgba(242,193,78,0.25)', paddingTop: 8, paddingBottom: 18, paddingHorizontal: 8 },
  you: { color: COLORS.text, textAlign: 'center', marginBottom: 6, fontWeight: '600' },
  hand: { flexDirection: 'row', justifyContent: 'center' },
  totals: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, flexWrap: 'wrap' },
  total: { color: COLORS.muted, fontSize: 12 },
  bidPanel: { backgroundColor: 'rgba(20,10,5,0.85)', padding: 12, maxHeight: 260 },
  panelTitle: { color: COLORS.text, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  bidButtons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  bidBtn: { backgroundColor: COLORS.accent, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8 },
  passBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.muted },
  bidBtnText: { color: '#1b1b1b', fontWeight: '700', fontSize: 14 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  resultPanel: { backgroundColor: '#2b1a0f', borderRadius: 14, padding: 20, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: COLORS.accent },
  resultHead: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  resultLine: { color: COLORS.text, fontSize: 15, marginVertical: 2 },
  resultSmall: { color: COLORS.muted, fontSize: 13, marginTop: 6 },
  nextBtn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12, marginTop: 16, alignItems: 'center' },
  nextBtnText: { color: '#1b1b1b', fontWeight: '800', fontSize: 16 },
});
