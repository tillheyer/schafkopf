import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  CardId,
  Contract,
  GameState,
  Trick,
  applyAction,
  chooseAction,
  contractName,
  createRng,
  legalBids,
  legalCards,
  newGame,
  next,
  suitOf,
  suitPower,
  trumpPower,
  SUIT_NAMES,
} from '../engine';
import { CardBack, CardView } from './CardView';
import { COLORS, PLAYER_NAMES, euro } from './theme';

const HUMAN = 0;
const AI_DELAY = 650;
const TRICK_PAUSE = 1300;

interface Match {
  game: GameState;
  totals: number[];
  gameNo: number;
}

function startMatch(): Match {
  return { game: newGame(3, createRng(Date.now())), totals: [0, 0, 0, 0], gameNo: 1 };
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

function bidLabel(b: Contract | null): string {
  if (!b) return 'Weiter';
  if (b.kind === 'sauspiel') return `Sauspiel auf die ${SUIT_NAMES[b.suit]}-Sau`;
  if (b.kind === 'wenz') return 'Wenz';
  return `${SUIT_NAMES[b.suit]}-Solo`;
}

export function GameScreen() {
  const [match, setMatch] = useState<Match>(startMatch);
  const [shownTrick, setShownTrick] = useState<Trick | null>(null);
  const [showLast, setShowLast] = useState(false);
  const { width } = useWindowDimensions();
  const game = match.game;
  const prevTricks = useRef(0);

  const dispatch = (a: Parameters<typeof applyAction>[1]) =>
    setMatch((m) => ({ ...m, game: applyAction(m.game, a) }));

  // Abgeschlossenen Stich kurz stehen lassen.
  useEffect(() => {
    if (game.tricks.length > prevTricks.current) {
      setShownTrick(game.tricks[game.tricks.length - 1]);
      const t = setTimeout(() => setShownTrick(null), TRICK_PAUSE);
      prevTricks.current = game.tricks.length;
      return () => clearTimeout(t);
    }
    prevTricks.current = game.tricks.length;
  }, [game.tricks.length]);

  // Computergegner ziehen lassen.
  useEffect(() => {
    if (shownTrick || game.phase === 'finished' || game.turn === HUMAN) return;
    const t = setTimeout(() => dispatch(chooseAction(game, game.turn)), AI_DELAY);
    return () => clearTimeout(t);
  }, [game, shownTrick]);

  const sortContract: Contract = game.contract ?? { kind: 'sauspiel', suit: 'E' };
  const hand = useMemo(() => sortHand(game.hands[HUMAN], sortContract), [game.hands, game.contract]);
  const legal = !shownTrick ? legalCards(game, HUMAN) : [];
  const cardW = Math.min(64, Math.floor((Math.min(width, 520) - 24) / 8) - 4);
  const tableCardW = Math.min(64, Math.floor(cardW * 1.15));

  const nextGame = () => {
    setShowLast(false);
    setMatch((m) => {
      const payouts = m.game.result?.kind === 'played' ? m.game.result.payouts : [0, 0, 0, 0];
      return {
        totals: m.totals.map((t, i) => t + payouts[i]),
        gameNo: m.gameNo + 1,
        game: newGame(next(m.game.dealer), createRng(Date.now() + m.gameNo)),
      };
    });
  };

  const tableTrick: Trick | null = showLast && game.tricks.length
    ? game.tricks[game.tricks.length - 1]
    : shownTrick ?? game.current;

  const status = (() => {
    if (game.phase === 'bidding') {
      return game.turn === HUMAN ? 'Du bist dran: Was spielst du?' : `${PLAYER_NAMES[game.turn]} überlegt …`;
    }
    if (game.phase === 'playing') {
      if (shownTrick) return `${PLAYER_NAMES[shownTrick.winner!]} ${shownTrick.winner === HUMAN ? 'machst' : 'macht'} den Stich`;
      return game.turn === HUMAN ? 'Du bist dran' : `${PLAYER_NAMES[game.turn]} ist dran`;
    }
    return '';
  })();

  const announcement =
    game.contract && game.declarer !== null
      ? `${PLAYER_NAMES[game.declarer]} ${game.declarer === HUMAN ? 'spielst' : 'spielt'} ${contractName(game.contract)}`
      : `Spiel ${match.gameNo} · ${PLAYER_NAMES[game.dealer]} ${game.dealer === HUMAN ? 'gibst' : 'gibt'}`;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Schafkopf</Text>
        <Text style={styles.announce} testID="announcement">{announcement}</Text>
      </View>

      <View style={styles.table}>
        <Seat player={2} game={game} style={styles.seatTop} cardW={cardW * 0.55} />
        <View style={styles.middleRow}>
          <Seat player={1} game={game} style={styles.seatSide} cardW={cardW * 0.45} />
          <TrickArea trick={tableTrick} cardW={tableCardW} />
          <Seat player={3} game={game} style={styles.seatSide} cardW={cardW * 0.45} />
        </View>
        <Text style={styles.status} testID="status">{status}</Text>
        {game.phase === 'playing' && game.tricks.length > 0 && !shownTrick && (
          <Pressable onPress={() => setShowLast((v) => !v)} style={styles.lastBtn}>
            <Text style={styles.lastBtnText}>{showLast ? 'Zurück zum Spiel' : 'Letzten Stich zeigen'}</Text>
          </Pressable>
        )}
      </View>

      {game.phase === 'bidding' && game.turn === HUMAN && (
        <BidPanel game={game} onBid={(c) => dispatch({ type: 'bid', player: HUMAN, contract: c })} />
      )}

      <View style={styles.handArea}>
        <Text style={styles.you}>
          Du{game.declarer === HUMAN ? ' · Spieler' : ''} · Stiche: {game.tricks.filter((t) => t.winner === HUMAN).length}
        </Text>
        <View style={styles.hand}>
          {hand.map((c) => (
            <CardView
              key={c}
              card={c}
              width={cardW}
              enabled={legal.includes(c) && !showLast}
              dimmed={game.phase === 'playing' && game.turn === HUMAN && !shownTrick && !legal.includes(c)}
              highlight={game.phase === 'playing' && game.turn === HUMAN && legal.includes(c) && !shownTrick}
              onPress={() => dispatch({ type: 'play', player: HUMAN, card: c })}
            />
          ))}
        </View>
        <View style={styles.totals}>
          {PLAYER_NAMES.map((n, i) => (
            <Text key={n} style={styles.total}>
              {n}: {euro(match.totals[i])}
            </Text>
          ))}
        </View>
      </View>

      {game.phase === 'finished' && !shownTrick && <ResultPanel game={game} onNext={nextGame} />}
    </View>
  );
}

function Seat({ player, game, style, cardW }: { player: number; game: GameState; style: object; cardW: number }) {
  const bid = game.bids.find((b) => b.player === player);
  const tricks = game.tricks.filter((t) => t.winner === player).length;
  const active = game.turn === player && game.phase !== 'finished';
  return (
    <View style={[styles.seat, style]}>
      <Text style={[styles.seatName, active && { color: COLORS.accent }]}>
        {PLAYER_NAMES[player]}
        {game.dealer === player ? ' (gibt)' : ''}
      </Text>
      {game.phase === 'bidding' && bid && <Text style={styles.bid}>{bidLabel(bid.contract)}</Text>}
      {game.phase !== 'bidding' && (
        <>
          {game.declarer === player && <Text style={styles.badge}>Spieler</Text>}
          <View style={styles.backs}>
            {game.hands[player].map((_, i) => (
              <View key={i} style={{ marginLeft: i === 0 ? 0 : -cardW * 0.65 }}>
                <CardBack width={cardW} />
              </View>
            ))}
          </View>
          <Text style={styles.seatInfo}>Stiche: {tricks}</Text>
        </>
      )}
      {game.phase === 'bidding' && (
        <View style={styles.backs}>
          {game.hands[player].map((_, i) => (
            <View key={i} style={{ marginLeft: i === 0 ? 0 : -cardW * 0.65 }}>
              <CardBack width={cardW} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function TrickArea({ trick, cardW }: { trick: Trick | null; cardW: number }) {
  const slot = (player: number) => {
    if (!trick) return null;
    const idx = (player - trick.leader + 4) % 4;
    const card = trick.cards[idx];
    return card ? <CardView card={card} width={cardW} highlight={trick.winner === player} /> : null;
  };
  const h = cardW * 1.5;
  return (
    <View style={[styles.trick, { width: cardW * 3.2, height: h * 2.6 }]} testID="trick">
      <View style={{ position: 'absolute', top: 0, alignSelf: 'center' }}>{slot(2)}</View>
      <View style={{ position: 'absolute', left: 0, top: h * 0.8 }}>{slot(1)}</View>
      <View style={{ position: 'absolute', right: 0, top: h * 0.8 }}>{slot(3)}</View>
      <View style={{ position: 'absolute', bottom: 0, alignSelf: 'center' }}>{slot(0)}</View>
    </View>
  );
}

function BidPanel({ game, onBid }: { game: GameState; onBid: (c: Contract | null) => void }) {
  const bids = legalBids(game, HUMAN);
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

function ResultPanel({ game, onNext }: { game: GameState; onNext: () => void }) {
  const r = game.result!;
  let body: React.ReactNode;
  if (r.kind === 'zamgeworfen') {
    body = <Text style={styles.resultLine}>Alle haben „weiter“ gesagt. Die Karten werden neu gegeben.</Text>;
  } else {
    const team = r.declarerTeam.map((p) => PLAYER_NAMES[p]).join(' und ');
    const humanWon = r.payouts[HUMAN] > 0;
    body = (
      <>
        <Text style={[styles.resultHead, { color: humanWon ? COLORS.accent : COLORS.text }]}>
          {humanWon ? 'Gewonnen!' : 'Verloren'}
        </Text>
        <Text style={styles.resultLine}>
          {contractName(r.contract)}: {team} {r.declarerTeam.length > 1 ? 'haben' : r.declarer === HUMAN ? 'hast' : 'hat'}{' '}
          {r.declarerPoints} Augen und {r.declarerWon ? 'gewonnen' : 'verloren'}.
        </Text>
        {r.partner !== null && <Text style={styles.resultLine}>Mitspieler mit der Sau: {PLAYER_NAMES[r.partner]}</Text>}
        <Text style={styles.resultLine}>Gegenspieler: {r.opponentPoints} Augen</Text>
        <Text style={styles.resultSmall}>{r.breakdown.join(' · ')} = {r.amount} Cent</Text>
        <View style={{ marginTop: 8 }}>
          {r.payouts.map((p, i) => (
            <Text key={i} style={styles.resultLine}>
              {PLAYER_NAMES[i]}: {euro(p)}
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
        <Pressable onPress={onNext} style={styles.nextBtn} testID="next-game">
          <Text style={styles.nextBtnText}>Nächstes Spiel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.table, paddingTop: 36 },
  header: { alignItems: 'center', paddingHorizontal: 16 },
  title: { color: COLORS.accent, fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  announce: { color: COLORS.text, fontSize: 14, marginTop: 2, textAlign: 'center' },
  table: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  middleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seat: { alignItems: 'center' },
  seatTop: { marginBottom: 6 },
  seatSide: { width: 80 },
  seatName: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  seatInfo: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  bid: { color: COLORS.accent, fontSize: 12, textAlign: 'center', marginVertical: 2 },
  badge: { color: '#1b1b1b', backgroundColor: COLORS.accent, fontSize: 11, paddingHorizontal: 6, borderRadius: 8, overflow: 'hidden', marginVertical: 2 },
  backs: { flexDirection: 'row', marginTop: 4 },
  trick: { position: 'relative' },
  status: { color: COLORS.text, textAlign: 'center', marginTop: 10, fontSize: 15, fontWeight: '600' },
  lastBtn: { alignSelf: 'center', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4 },
  lastBtnText: { color: COLORS.muted, fontSize: 13, textDecorationLine: 'underline' },
  handArea: { backgroundColor: COLORS.tableDark, paddingTop: 8, paddingBottom: 18, paddingHorizontal: 8 },
  you: { color: COLORS.text, textAlign: 'center', marginBottom: 6, fontWeight: '600' },
  hand: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  totals: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, flexWrap: 'wrap' },
  total: { color: COLORS.muted, fontSize: 12 },
  bidPanel: { backgroundColor: COLORS.panel, padding: 12, maxHeight: 260 },
  panelTitle: { color: COLORS.text, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  bidButtons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  bidBtn: { backgroundColor: COLORS.accent, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8 },
  passBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.muted },
  bidBtnText: { color: '#1b1b1b', fontWeight: '700', fontSize: 14 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  resultPanel: { backgroundColor: COLORS.panel, borderRadius: 14, padding: 20, width: '100%', maxWidth: 420, borderWidth: 1, borderColor: COLORS.accent },
  resultHead: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  resultLine: { color: COLORS.text, fontSize: 15, marginVertical: 2 },
  resultSmall: { color: COLORS.muted, fontSize: 13, marginTop: 6 },
  nextBtn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12, marginTop: 16, alignItems: 'center' },
  nextBtnText: { color: '#1b1b1b', fontWeight: '800', fontSize: 16 },
});
