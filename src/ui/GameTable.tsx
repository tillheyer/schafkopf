import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  Action,
  CardId,
  Contract,
  GameState,
  Trick,
  canAnswerHochzeit,
  canKontra,
  canRe,
  contractName,
  isTout,
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
  return b ? contractName(b) : 'Weiter';
}

/** Kurze Beschriftung für die Ansage-Knöpfe. */
function shortBid(b: Contract | null): string {
  if (b?.kind === 'sauspiel') return `Auf die ${SUIT_NAMES[b.suit]}-Sau`;
  return bidLabel(b);
}

/** Was ein Spieler bei seiner Ansage sagt (Sprechblase). */
function bidSpeech(b: Contract | null): string {
  if (!b) return 'Weiter';
  if (b.kind === 'sauspiel') return `Ich spiel auf die ${SUIT_NAMES[b.suit]}-Sau`;
  if (b.kind === 'hochzeit') return 'Ich hätt a Hochzeit!';
  return `${contractName(b)}!`;
}

const BUBBLE_MS = 2800;

/**
 * Sprechblasen: Ansagen bleiben während des Reizens stehen und verschwinden
 * kurz danach; Kontra und Re erscheinen für ein paar Sekunden.
 */
function useBubbles(game: GameState, gameNo: number): (string | null)[] {
  const [, setTick] = useState(0);
  const flashes = useRef<{ player: number; text: string; until: number }[]>([]);
  const bidsUntil = useRef(0);
  const prev = useRef({ gameNo, phase: game.phase, kontra: game.kontra ?? null, re: game.re ?? null, turn: game.turn });

  useEffect(() => {
    const p = prev.current;
    const now = Date.now();
    if (p.gameNo !== gameNo) {
      flashes.current = [];
      bidsUntil.current = 0;
    } else {
      if (p.phase === 'bidding' && game.phase !== 'bidding') bidsUntil.current = now + BUBBLE_MS;
      const k = game.kontra ?? null;
      const r = game.re ?? null;
      if (k !== null && p.kontra === null) flashes.current.push({ player: k, text: 'Kontra!', until: now + BUBBLE_MS + 400 });
      if (r !== null && p.re === null) flashes.current.push({ player: r, text: 'Re!', until: now + BUBBLE_MS + 400 });
      // Hochzeit: wer ablehnt, sagt "Na", wer annimmt, "I nimm's!".
      if (p.phase === 'hochzeit') {
        if (game.phase === 'playing' && game.partner !== null) {
          flashes.current.push({ player: game.partner, text: 'I nimm’s!', until: now + BUBBLE_MS });
        } else if (p.turn !== game.turn || game.phase !== 'hochzeit') {
          flashes.current.push({ player: p.turn, text: 'Na, danke', until: now + BUBBLE_MS });
        }
      }
    }
    prev.current = { gameNo, phase: game.phase, kontra: game.kontra ?? null, re: game.re ?? null, turn: game.turn };
    const ends = [bidsUntil.current, ...flashes.current.map((f) => f.until)].filter((t) => t > now);
    setTick((t) => t + 1);
    if (!ends.length) return;
    const t = setTimeout(() => setTick((x) => x + 1), Math.min(...ends) - now + 20);
    return () => clearTimeout(t);
  }, [gameNo, game.phase, game.kontra, game.re, game.turn]);

  const now = Date.now();
  const out: (string | null)[] = [null, null, null, null];
  if (game.phase === 'bidding' || now < bidsUntil.current) {
    for (const b of game.bids) out[b.player] = bidSpeech(b.contract);
  }
  for (const f of flashes.current) if (f.until > now) out[f.player] = f.text;
  return out;
}

export function GameTable(props: GameTableProps) {
  const { game, me, names, totals, gameNo, onAction } = props;
  const [shownTrick, setShownTrick] = useState<Trick | null>(null);
  const [showLast, setShowLast] = useState(false);
  const { width, height } = useWindowDimensions();
  const prevTricks = useRef(game.tricks.length);
  const prevGameNo = useRef(gameNo);

  const bubbles = useBubbles(game, gameNo);
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
  const answeringHochzeit = canAnswerHochzeit(game, me);

  const tableTrick: Trick | null =
    showLast && game.tricks.length ? game.tricks[game.tricks.length - 1] : shownTrick ?? game.current;

  const status = (() => {
    if (game.phase === 'bidding') {
      return myTurn ? 'Du bist dran: Was spielst du?' : `${names[game.turn]} überlegt …`;
    }
    if (game.phase === 'hochzeit') {
      if (answeringHochzeit) return `Nimmst du ${names[game.declarer!]}s Hochzeit? Tippe die Karte an, die du dafür abgibst.`;
      return `${names[game.turn]} überlegt, ob ${game.turn === me ? 'du' : 'er/sie'} die Hochzeit nimmt …`;
    }
    if (game.phase === 'playing') {
      if (shownTrick) return `${who(shownTrick.winner!)} ${verb(shownTrick.winner!, 'machst', 'macht')} den Stich`;
      return myTurn ? 'Du bist dran' : `${names[game.turn]} ist dran`;
    }
    return '';
  })();

  const bock = (game.bock ?? 1) > 1 ? ` · Bock ×${game.bock}` : '';
  const doubles = `${(game.kontra ?? null) !== null ? ' · Kontra' : ''}${(game.re ?? null) !== null ? ' · Re' : ''}${bock}`;
  const announcement = (() => {
    const c = game.contract;
    if (c?.kind === 'ramsch') return `Ramsch: wer die meisten Augen hat, verliert${bock}`;
    if (c?.kind === 'hochzeit' && game.declarer !== null && game.partner !== null && game.phase !== 'hochzeit') {
      return `Hochzeit: ${who(game.declarer)} und ${who(game.partner)} spielen zusammen${doubles}`;
    }
    if (c && game.declarer !== null) return `${who(game.declarer)} ${verb(game.declarer, 'spielst', 'spielt')} ${contractName(c)}${doubles}`;
    const muss = game.muss && game.phase === 'bidding' ? ' · Muss-Spiel (Eichel-Ober)' : '';
    return `Spiel ${gameNo} · ${who(game.dealer)} ${verb(game.dealer, 'gibst', 'gibt')}${bock}${muss}`;
  })();
  const showKontra = !shownTrick && canKontra(game, me);
  const showRe = !shownTrick && canRe(game, me);

  // Sitzposition relativ zu mir: 0 unten, 1 links, 2 oben, 3 rechts.
  const at = (rel: number) => (me + rel) % 4;

  return (
    <ImageBackground source={require('../../assets/images/holz.jpg')} resizeMode="cover" style={styles.root} imageStyle={styles.bgImage}>
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
        <Seat player={at(2)} game={game} names={names} style={styles.seatTop} cardW={22} bubble={bubbles[at(2)]} pos="top" />
        <View style={styles.middleRow}>
          <Seat player={at(1)} game={game} names={names} style={styles.seatSide} cardW={18} bubble={bubbles[at(1)]} pos="left" />
          <TrickArea trick={tableTrick} cardW={tableCardW} me={me} />
          <Seat player={at(3)} game={game} names={names} style={styles.seatSide} cardW={18} bubble={bubbles[at(3)]} pos="right" />
        </View>
        <Text style={styles.status} testID="status">
          {status}
        </Text>
        {answeringHochzeit && (
          <Pressable
            onPress={() => onAction({ type: 'hochzeit', player: me, accept: false })}
            style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.7 }]}
            testID="hochzeit-nein"
          >
            <Text style={styles.declineBtnText}>Nein, danke</Text>
          </Pressable>
        )}
        {(showKontra || showRe) && (
          <Pressable
            onPress={() => onAction({ type: showKontra ? 'kontra' : 're', player: me })}
            style={({ pressed }) => [styles.kontraBtn, pressed && { opacity: 0.7 }]}
            testID={showKontra ? 'kontra' : 're'}
          >
            <Text style={styles.kontraBtnText}>{showKontra ? 'Kontra geben' : 'Re geben'}</Text>
          </Pressable>
        )}
        {game.phase === 'playing' && game.tricks.length > 0 && !shownTrick && (
          <Pressable onPress={() => setShowLast((v) => !v)} style={styles.lastBtn}>
            <Text style={styles.lastBtnText}>{showLast ? 'Zurück zum Spiel' : 'Letzten Stich zeigen'}</Text>
          </Pressable>
        )}
        {game.phase === 'bidding' && myTurn && (
          <BidPanel game={game} me={me} onBid={(c) => onAction({ type: 'bid', player: me, contract: c })} />
        )}
      </View>


      <View style={styles.handArea}>
        {bubbles[me] && (
          <View style={styles.myBubbleWrap} pointerEvents="none">
            <Bubble text={bubbles[me]!} tail="down" />
          </View>
        )}
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
              enabled={(legal.includes(c) && !showLast) || answeringHochzeit}
              dimmed={game.phase === 'playing' && myTurn && !shownTrick && !legal.includes(c)}
              highlight={(game.phase === 'playing' && myTurn && legal.includes(c) && !shownTrick) || answeringHochzeit}
              onPress={() =>
                answeringHochzeit
                  ? onAction({ type: 'hochzeit', player: me, accept: true, give: c })
                  : onAction({ type: 'play', player: me, card: c })
              }
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

function Bubble({ text, tail, tailRight, centered }: { text: string; tail: 'down' | 'left'; tailRight?: boolean; centered?: boolean }) {
  const loud = text === 'Kontra!' || text === 'Re!';
  const tailStyle =
    tail === 'down'
      ? [styles.tailDown, tailRight && { left: undefined, right: 14 }, centered && { left: '50%', marginLeft: -7 }, loud && { borderTopColor: '#c0392b' }]
      : [styles.tailLeft, loud && { borderRightColor: '#c0392b' }];
  return (
    <View style={[styles.bubble, loud && styles.bubbleLoud]} testID="bubble">
      <Text style={[styles.bubbleText, loud && styles.bubbleTextLoud]}>{text}</Text>
      <View style={tailStyle} />
    </View>
  );
}

function Seat({
  player,
  game,
  names,
  style,
  cardW,
  bubble,
  pos,
}: {
  player: number;
  game: GameState;
  names: string[];
  style: object;
  cardW: number;
  bubble: string | null;
  pos: 'top' | 'left' | 'right';
}) {
  const tricks = game.tricks.filter((t) => t.winner === player).length;
  // Bettel Brett: die Karten des Spielers liegen offen.
  const open =
    game.phase === 'playing' && game.contract?.kind === 'bettel' && !!game.contract.brett && game.declarer === player &&
    !game.hands[player].includes('??' as CardId);
  const openW = pos === 'top' ? 34 : 26;
  const active = game.turn === player && game.phase !== 'finished';
  return (
    <View style={[styles.seat, style, bubble ? { zIndex: 20 } : null]}>
      {bubble && (
        <View
          pointerEvents="none"
          style={[styles.bubbleWrap, pos === 'top' ? styles.bubbleTop : pos === 'left' ? styles.bubbleLeft : styles.bubbleRight]}
        >
          <Bubble text={bubble} tail={pos === 'top' ? 'left' : 'down'} tailRight={pos === 'right'} />
        </View>
      )}
      <Text style={[styles.seatName, active && { color: COLORS.accent }]} numberOfLines={1}>
        {names[player]}
      </Text>
      {game.dealer === player && <Text style={styles.dealer}>gibt</Text>}
      {game.phase !== 'bidding' && game.declarer === player && <Text style={styles.badge}>Spieler</Text>}
      <View style={styles.backs}>
        {open
          ? game.hands[player].map((c, i) => (
              <View key={c} style={{ marginLeft: i === 0 ? 0 : -openW * 0.62 }}>
                <CardView card={c} width={openW} />
              </View>
            ))
          : game.hands[player].map((_, i) => (
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

/** Spielart, unter der eine Ansage im Ansage-Feld gruppiert wird. */
function family(c: Contract): string {
  if (c.kind === 'bettel') return c.brett ? 'brett' : 'bettel';
  return c.kind;
}

const FAMILY_LABEL: Record<string, string> = {
  sauspiel: 'Sauspiel',
  hochzeit: 'Hochzeit',
  bettel: 'Bettel',
  farbwenz: 'Farbwenz',
  farbgeier: 'Farbgeier',
  wenz: 'Wenz',
  geier: 'Geier',
  solo: 'Solo',
  brett: 'Bettel Brett',
  sie: 'Sie',
};

/** Beschriftung einer Variante innerhalb der Spielart. */
function variantLabel(c: Contract): string {
  if (c.kind === 'sauspiel') return `Auf die ${SUIT_NAMES[c.suit]}-Sau`;
  return contractName(c);
}

/**
 * Ansage in zwei Schritten: erst die Spielart, dann (falls nötig) Farbe bzw. Tout.
 * Gibt es für eine Spielart nur eine Möglichkeit, wird sie sofort angesagt.
 */
function BidPanel({ game, me, onBid }: { game: GameState; me: number; onBid: (c: Contract | null) => void }) {
  const bids = legalBids(game, me);
  const [fam, setFam] = useState<string | null>(null);
  const games = bids.filter((b): b is Contract => b !== null);
  const families = [...new Set(games.map(family))];
  const variants = fam ? games.filter((b) => family(b) === fam) : [];
  const btn = (key: string, label: string, onPress: () => void, ghost = false) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ pressed }) => [styles.bidBtn, ghost && styles.passBtn, pressed && { opacity: 0.7 }]}
      testID={key}
    >
      <Text style={[styles.bidBtnText, ghost && { color: COLORS.text }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.bidPanel}>
      <Text style={styles.panelTitle}>{fam ? FAMILY_LABEL[fam] : 'Deine Ansage'}</Text>
      <ScrollView contentContainerStyle={styles.bidButtons}>
        {fam
          ? [
              btn('bid-back', '‹ Zurück', () => setFam(null), true),
              ...variants.map((v) => btn(`bid-${bidLabel(v)}`, variantLabel(v), () => onBid(v))),
            ]
          : [
              ...(bids.includes(null) ? [btn('bid-Weiter', 'Weiter', () => onBid(null), true)] : []),
              ...families.map((f) => {
                const vs = games.filter((b) => family(b) === f);
                return vs.length === 1
                  ? btn(`bid-${bidLabel(vs[0])}`, f === 'sauspiel' ? variantLabel(vs[0]) : FAMILY_LABEL[f], () => onBid(vs[0]))
                  : btn(`fam-${f}`, `${FAMILY_LABEL[f]} …`, () => setFam(f));
              }),
            ]}
      </ScrollView>
    </View>
  );
}

function ResultPanel({ game, me, names, onNext, nextHint, nextDisabled }: GameTableProps) {
  const r = game.result!;
  let body: React.ReactNode;
  if (r.kind === 'zamgeworfen') {
    body = <Text style={styles.resultLine}>Alle haben „weiter“ gesagt. Die Karten werden neu gegeben.</Text>;
  } else if (r.kind === 'ramsch') {
    const mine = r.payouts[me];
    body = (
      <>
        <Text style={[styles.resultHead, { color: mine > 0 ? COLORS.accent : COLORS.text }]}>
          {mine > 0 ? 'Gewonnen!' : mine < 0 ? 'Verloren' : 'Unentschieden'}
        </Text>
        <Text style={styles.resultLine}>
          {r.durchmarsch !== null
            ? `Durchmarsch! ${names[r.durchmarsch]} hat alle Stiche gemacht.`
            : `Ramsch: ${r.losers.map((p) => (p === me ? 'Du' : names[p])).join(' und ')} ${r.losers.length > 1 ? 'haben' : r.losers[0] === me ? 'hast' : 'hat'} die meisten Augen.`}
        </Text>
        {r.points.map((pts, i) => (
          <Text key={i} style={styles.resultSmall}>
            {names[i]}: {pts} Augen, {r.tricks[i]} {r.tricks[i] === 1 ? 'Stich' : 'Stiche'}
          </Text>
        ))}
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
  } else {
    const team = r.declarerTeam.map((p) => (p === me ? 'Du' : names[p])).join(' und ');
    const won = r.payouts[me] > 0;
    body = (
      <>
        <Text style={[styles.resultHead, { color: won ? COLORS.accent : COLORS.text }]}>{won ? 'Gewonnen!' : 'Verloren'}</Text>
        <Text style={styles.resultLine}>
          {contractName(r.contract)}: {team} {r.declarerTeam.length > 1 ? (r.declarerTeam.includes(me) ? 'habt' : 'haben') : r.declarer === me ? 'hast' : 'hat'}{' '}
          {r.contract.kind === 'bettel' || isTout(r.contract)
            ? `${r.declarerTricks} ${r.declarerTricks === 1 ? 'Stich' : 'Stiche'}`
            : r.contract.kind === 'sie'
              ? 'alle Ober und Unter'
              : `${r.declarerPoints} Augen`}{' '}
          und {r.declarerWon ? 'gewonnen' : 'verloren'}.
        </Text>
        {r.partner !== null && (
          <Text style={styles.resultLine}>
            {r.contract.kind === 'hochzeit' ? 'Hochzeit mit' : 'Mitspieler mit der Sau'}: {names[r.partner]}
          </Text>
        )}
        {r.contract.kind !== 'bettel' && !isTout(r.contract) && r.contract.kind !== 'sie' && (
          <Text style={styles.resultLine}>Gegenspieler: {r.opponentPoints} Augen</Text>
        )}
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
  bgImage: { width: '100%', height: '100%' },
  root: { overflow: 'hidden',  flex: 1, backgroundColor: '#2a1810', paddingTop: 36 },
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
  bubbleWrap: { position: 'absolute', zIndex: 30 },
  bubbleTop: { left: '50%', top: -4, marginLeft: 46 },
  bubbleLeft: { left: 0, bottom: '100%', marginBottom: 6 },
  bubbleRight: { right: 0, bottom: '100%', marginBottom: 6 },
  myBubbleWrap: { position: 'absolute', bottom: '100%', left: 12, marginBottom: 6, zIndex: 30, maxWidth: 140 },
  bubble: { backgroundColor: '#fffaf0', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 170, width: 'max-content' as unknown as number, borderWidth: 1.5, borderColor: '#d9c9a3', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  bubbleLoud: { backgroundColor: '#c0392b', borderColor: '#f2c14e' },
  bubbleText: { color: '#2b1a10', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  bubbleTextLoud: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  tailDown: { position: 'absolute', bottom: -7, left: 14, width: 0, height: 0, borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 8, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fffaf0' },
  tailLeft: { position: 'absolute', left: -8, top: 9, width: 0, height: 0, borderTopWidth: 7, borderBottomWidth: 7, borderRightWidth: 8, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderRightColor: '#fffaf0' },
  declineBtn: { alignSelf: 'center', marginTop: 8, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1.5, borderColor: COLORS.muted },
  declineBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  kontraBtn: { alignSelf: 'center', marginTop: 8, backgroundColor: '#c0392b', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 8, borderWidth: 1.5, borderColor: '#f2c14e' },
  kontraBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
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
  bidPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40, backgroundColor: 'rgba(20,10,5,0.92)', padding: 10, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(242,193,78,0.35)' },
  panelTitle: { color: COLORS.text, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  bidButtons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  bidBtn: { backgroundColor: COLORS.accent, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 8 },
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
