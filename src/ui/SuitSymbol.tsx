import React from 'react';
import { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';
import { Suit } from '../engine';

/**
 * Farbzeichen des bayerischen Blatts, selbst gezeichnet.
 * Koordinatensystem 0..20, Mittelpunkt (10,10). Mit x/y/size platzieren.
 */
interface Props {
  suit: Suit;
  x: number; // Mittelpunkt
  y: number;
  size: number; // Kantenlänge
  rotate?: number;
}

export function SuitSymbol({ suit, x, y, size, rotate = 0 }: Props) {
  const s = size / 20;
  return (
    <G transform={`translate(${x} ${y}) rotate(${rotate}) scale(${s}) translate(-10 -10)`}>
      {suit === 'H' && <Herz />}
      {suit === 'G' && <Gras />}
      {suit === 'E' && <Eichel />}
      {suit === 'S' && <Schellen />}
    </G>
  );
}

const OUTLINE = '#2a1a10';

function Herz() {
  return (
    <G>
      <Path
        d="M10 18.6 C 3.2 13.2 0.6 9.4 1.6 6 C 2.6 2.4 7.2 1.4 10 5 C 12.8 1.4 17.4 2.4 18.4 6 C 19.4 9.4 16.8 13.2 10 18.6 Z"
        fill="#cf1f2b"
        stroke={OUTLINE}
        strokeWidth={0.7}
      />
      <Path d="M4.2 6.2 C 4.6 4.4 6.6 3.8 7.8 5" stroke="#f6a3a3" strokeWidth={1.1} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Gras() {
  return (
    <G>
      <Path
        d="M10 0.8 C 15.8 4.4 18.6 9.4 14.2 14 C 13 15.2 11.6 15.8 10.7 16.2 L 10.9 19.4 L 9.1 19.4 L 9.3 16.2 C 8.4 15.8 7 15.2 5.8 14 C 1.4 9.4 4.2 4.4 10 0.8 Z"
        fill="#2f8a32"
        stroke={OUTLINE}
        strokeWidth={0.7}
      />
      <Line x1={10} y1={3} x2={10} y2={16} stroke="#174f19" strokeWidth={0.7} />
      <Path d="M10 7 L 6.6 5.4 M10 9.6 L 5.6 8.4 M10 12.2 L 6.2 11.4 M10 7 L 13.4 5.4 M10 9.6 L 14.4 8.4 M10 12.2 L 13.8 11.4" stroke="#174f19" strokeWidth={0.55} />
      <Path d="M6.4 6.6 C 6.8 5 8 3.8 9 3.2" stroke="#8fd18f" strokeWidth={0.8} fill="none" strokeLinecap="round" />
    </G>
  );
}

function Eichel() {
  return (
    <G>
      {/* Eichel: Frucht oben, Hütchen unten, Stiel */}
      <Path d="M10 16 L 10 19.6" stroke="#5a3415" strokeWidth={1.2} strokeLinecap="round" />
      <Ellipse cx={10} cy={7.4} rx={5.2} ry={6.6} fill="#d9a62e" stroke={OUTLINE} strokeWidth={0.7} />
      <Path d="M7 4.2 C 7.6 2.8 8.6 2 9.6 1.8" stroke="#f6e09a" strokeWidth={1} fill="none" strokeLinecap="round" />
      <Path
        d="M3.8 11 C 3.8 9.6 16.2 9.6 16.2 11 L 15.2 14.6 C 13.6 16.6 6.4 16.6 4.8 14.6 Z"
        fill="#6e4019"
        stroke={OUTLINE}
        strokeWidth={0.7}
      />
      <Path d="M5.4 12 L 7 15.2 M8 11.2 L 9.2 15.8 M12 11.2 L 10.8 15.8 M14.6 12 L 13 15.2 M4.6 12.6 L 15.4 12.6" stroke="#3b200a" strokeWidth={0.5} />
    </G>
  );
}

function Schellen() {
  return (
    <G>
      <Circle cx={10} cy={2.4} r={1.4} fill="#c98c12" stroke={OUTLINE} strokeWidth={0.5} />
      <Circle cx={10} cy={10.6} r={7.8} fill="#efb21c" stroke={OUTLINE} strokeWidth={0.7} />
      <Rect x={2.4} y={8.2} width={15.2} height={2.6} fill="#c62828" stroke={OUTLINE} strokeWidth={0.4} />
      <Circle cx={10} cy={15} r={1.3} fill={OUTLINE} />
      <Line x1={10} y1={15} x2={10} y2={18.4} stroke={OUTLINE} strokeWidth={0.8} />
      <Path d="M5.4 6.2 C 6.4 4.6 8 3.8 9.6 3.6" stroke="#fde7a2" strokeWidth={1} fill="none" strokeLinecap="round" />
    </G>
  );
}
