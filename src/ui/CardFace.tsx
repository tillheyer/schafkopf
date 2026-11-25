import React from 'react';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { CardId, Rank, Suit, rankOf, suitOf } from '../engine';
import { SuitSymbol } from './SuitSymbol';

/**
 * Karte im Stil des bayerischen Blatts (eigene Zeichnung, keine Fremdgrafik).
 * Zahlkarten mit Farbzeichen, Bildkarten doppelköpfig wie im echten Blatt:
 * beim Ober sitzt das Farbzeichen oben, beim Unter in der Mitte.
 */

const W = 100;
const H = 150;
const INK = '#2a1a10';
const PAPER = '#fbf4e2';

const INDEX: Record<Rank, string> = { A: 'A', '10': '10', K: 'K', O: 'O', U: 'U', '9': '9', '8': '8', '7': '7' };

/** Farbe der Gewänder je Farbe. */
const ROBE: Record<Suit, { main: string; trim: string }> = {
  E: { main: '#7b4a1e', trim: '#e0b24a' },
  G: { main: '#2e7d32', trim: '#e7c35a' },
  H: { main: '#c0282f', trim: '#f0c65c' },
  S: { main: '#2f5aa0', trim: '#efb21c' },
};

const PIPS: Record<string, [number, number][]> = {
  '7': [[34, 32], [66, 32], [34, 62], [66, 62], [34, 92], [66, 92], [50, 120]],
  '8': [[34, 30], [66, 30], [34, 60], [66, 60], [34, 90], [66, 90], [34, 120], [66, 120]],
  '9': [[34, 30], [66, 30], [34, 56], [66, 56], [50, 75], [34, 94], [66, 94], [34, 120], [66, 120]],
  '10': [[30, 30], [70, 30], [50, 42], [30, 56], [70, 56], [30, 94], [70, 94], [50, 108], [30, 120], [70, 120]],
};

export function CardFace({ card, width, highlight }: { card: CardId; width: number; highlight?: boolean }) {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const id = card;
  return (
    <Svg width={width} height={width * 1.5} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <LinearGradient id={`paper-${id}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#fffaf0" />
          <Stop offset="1" stopColor="#efe3c4" />
        </LinearGradient>
      </Defs>
      <Rect x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} rx={7} fill={`url(#paper-${id})`} stroke={highlight ? '#f2c14e' : '#6b5a40'} strokeWidth={highlight ? 3.5 : 1.5} />
      <Rect x={5} y={5} width={W - 10} height={H - 10} rx={4} fill="none" stroke="#a8916a" strokeWidth={0.8} />

      {rank in PIPS && <NumberCard suit={suit} rank={rank} />}
      {rank === 'A' && <SauCard suit={suit} />}
      {(rank === 'O' || rank === 'U' || rank === 'K') && <FaceCard suit={suit} rank={rank} />}

      <Corner suit={suit} rank={rank} />
      <G transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <Corner suit={suit} rank={rank} />
      </G>
    </Svg>
  );
}

function Corner({ suit, rank }: { suit: Suit; rank: Rank }) {
  return (
    <G>
      <Rect x={2.5} y={3} width={rank === '10' ? 18 : 15} height={31} rx={3} fill={PAPER} opacity={0.92} />
      <SvgText x={rank === '10' ? 11.5 : 10} y={19} fontSize={rank === '10' ? 15 : 18} fontWeight="bold" fontFamily="Georgia, serif" fill={INK} textAnchor="middle">
        {INDEX[rank]}
      </SvgText>
      <SuitSymbol suit={suit} x={rank === '10' ? 11.5 : 10} y={27} size={9} />
    </G>
  );
}

function NumberCard({ suit, rank }: { suit: Suit; rank: Rank }) {
  return (
    <G>
      {PIPS[rank].map(([x, y], i) => (
        <SuitSymbol key={i} suit={suit} x={x} y={y} size={19} rotate={y > 76 ? 180 : 0} />
      ))}
      {rank === '10' && (
        // Banner mit "X" wie beim Zehner im bayerischen Blatt
        <G>
          <Path d="M30 69 L 70 69 L 66 75 L 70 81 L 30 81 L 34 75 Z" fill="#c62828" stroke={INK} strokeWidth={0.7} />
          <SvgText x={50} y={79} fontSize={10} fontWeight="bold" fontFamily="Georgia, serif" fill="#fff6dc" textAnchor="middle">X</SvgText>
        </G>
      )}
    </G>
  );
}

function SauCard({ suit }: { suit: Suit }) {
  return (
    <G>
      {/* Ornamentrahmen */}
      <Path d="M50 18 C 80 24 88 48 86 75 C 88 102 80 126 50 132 C 20 126 12 102 14 75 C 12 48 20 24 50 18 Z" fill="#f5e7c2" stroke="#b08a4a" strokeWidth={1.2} />
      <Path d="M24 40 C 30 34 34 36 36 30 M76 40 C 70 34 66 36 64 30 M24 110 C 30 116 34 114 36 120 M76 110 C 70 116 66 114 64 120" stroke="#2e7d32" strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx={36} cy={30} r={2.2} fill="#c62828" />
      <Circle cx={64} cy={30} r={2.2} fill="#c62828" />
      <Circle cx={36} cy={120} r={2.2} fill="#c62828" />
      <Circle cx={64} cy={120} r={2.2} fill="#c62828" />
      <SuitSymbol suit={suit} x={50} y={70} size={52} />
      <Path d="M28 104 L 72 104 L 68 110 L 72 116 L 28 116 L 32 110 Z" fill="#c62828" stroke={INK} strokeWidth={0.7} />
      <SvgText x={50} y={113.5} fontSize={9} fontWeight="bold" fontFamily="Georgia, serif" fill="#fff6dc" textAnchor="middle">SAU</SvgText>
    </G>
  );
}

/** Halbe Figur (Brustbild), wird gespiegelt für die doppelköpfige Bildkarte. */
function HalfFigure({ suit, rank }: { suit: Suit; rank: 'O' | 'U' | 'K' }) {
  const robe = ROBE[suit];
  const skin = '#f1c9a0';
  return (
    <G>
      {/* Gewand */}
      <Path d="M18 75 L 18 66 C 20 56 30 52 38 50 L 62 50 C 70 52 80 56 82 66 L 82 75 Z" fill={robe.main} stroke={INK} strokeWidth={0.8} />
      <Path d="M44 50 L 50 75 L 56 50" fill="none" stroke={robe.trim} strokeWidth={2.2} />
      <Path d="M18 70 L 82 70" stroke={robe.trim} strokeWidth={1.5} />
      {/* Kragen */}
      <Path d="M36 50 C 42 56 58 56 64 50 C 60 47 40 47 36 50 Z" fill="#fffaf0" stroke={INK} strokeWidth={0.6} />
      {/* Kopf */}
      <Circle cx={50} cy={38} r={9.5} fill={skin} stroke={INK} strokeWidth={0.7} />
      <Circle cx={46.5} cy={37} r={0.9} fill={INK} />
      <Circle cx={53.5} cy={37} r={0.9} fill={INK} />
      <Path d="M47 42 C 49 43.4 51 43.4 53 42" stroke={INK} strokeWidth={0.6} fill="none" />
      {rank === 'K' && <Path d="M41.5 42 C 43 50 57 50 58.5 42 C 55 45 45 45 41.5 42 Z" fill="#8a5a2b" stroke={INK} strokeWidth={0.5} />}
      {rank !== 'K' && <Path d="M45 43.6 C 47 42.4 53 42.4 55 43.6" stroke="#6b3d17" strokeWidth={1.2} fill="none" />}
      {/* Kopfbedeckung */}
      {rank === 'K' && (
        <Path d="M40 31 L 40 21 L 44.5 26 L 50 18 L 55.5 26 L 60 21 L 60 31 Z" fill="#e8b923" stroke={INK} strokeWidth={0.7} />
      )}
      {rank === 'O' && (
        <G>
          <Path d="M38 32 C 38 22 62 22 62 32 Z" fill={robe.main} stroke={INK} strokeWidth={0.7} />
          <Path d="M58 25 C 64 16 70 18 72 14" stroke="#fffaf0" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </G>
      )}
      {rank === 'U' && <Path d="M39 31 C 41 25 59 25 61 31 C 56 29.5 44 29.5 39 31 Z" fill="#3a2a1a" stroke={INK} strokeWidth={0.7} />}
    </G>
  );
}

function FaceCard({ suit, rank }: { suit: Suit; rank: 'O' | 'U' | 'K' }) {
  // Ober: Farbzeichen oben in der Ecke der Figur; Unter: tiefer, auf Brusthöhe; König: neben dem Kopf.
  const symbol =
    rank === 'O' ? { x: 74, y: 22 } : rank === 'U' ? { x: 72, y: 60 } : { x: 74, y: 36 };
  return (
    <G>
      <Rect x={12} y={12} width={76} height={126} rx={3} fill="#f7ecd0" stroke="#a8916a" strokeWidth={0.8} />
      <G>
        <HalfFigure suit={suit} rank={rank} />
        <SuitSymbol suit={suit} x={symbol.x} y={symbol.y} size={15} />
      </G>
      <G transform={`rotate(180 ${W / 2} ${H / 2})`}>
        <HalfFigure suit={suit} rank={rank} />
        <SuitSymbol suit={suit} x={symbol.x} y={symbol.y} size={15} />
      </G>
      <Line x1={12} y1={75} x2={88} y2={75} stroke={INK} strokeWidth={0.8} />
    </G>
  );
}

/** Rückseite: dunkelgrünes Rautenmuster mit goldenem Rahmen. */
export function CardBackFace({ width }: { width: number }) {
  const lines = [];
  for (let i = -150; i <= 150; i += 12) {
    lines.push(<Line key={`a${i}`} x1={i} y1={0} x2={i + 150} y2={150} stroke="#3f7a4e" strokeWidth={1.2} />);
    lines.push(<Line key={`b${i}`} x1={i + 150} y1={0} x2={i} y2={150} stroke="#3f7a4e" strokeWidth={1.2} />);
  }
  return (
    <Svg width={width} height={width * 1.5} viewBox="0 0 100 150">
      <Rect x={0.75} y={0.75} width={98.5} height={148.5} rx={7} fill="#fbf4e2" stroke="#6b5a40" strokeWidth={1.5} />
      <Rect x={6} y={6} width={88} height={138} rx={4} fill="#1d4a2c" />
      <G>{lines}</G>
      <Rect x={0.75} y={0.75} width={98.5} height={148.5} rx={7} fill="none" stroke="#fbf4e2" strokeWidth={12} />
      <Rect x={6} y={6} width={88} height={138} rx={4} fill="none" stroke="#d4a937" strokeWidth={2} />
      <Rect x={0.75} y={0.75} width={98.5} height={148.5} rx={7} fill="none" stroke="#6b5a40" strokeWidth={1.5} />
    </Svg>
  );
}
