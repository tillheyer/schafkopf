import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CardId, rankOf, suitOf } from '../engine';
import { COLORS, SUIT_COLOR, SUIT_SYMBOL } from './theme';

const RANK_LABEL: Record<string, string> = { A: 'A', '10': '10', K: 'K', O: 'O', U: 'U', '9': '9', '8': '8', '7': '7' };

interface Props {
  card: CardId;
  width: number;
  enabled?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
  highlight?: boolean;
}

export function CardView({ card, width, enabled, dimmed, onPress, highlight }: Props) {
  const height = Math.round(width * 1.5);
  const suit = suitOf(card);
  const rank = rankOf(card);
  const color = SUIT_COLOR[suit];
  const big = rank === 'O' || rank === 'U' || rank === 'K';
  return (
    <Pressable
      disabled={!enabled}
      onPress={onPress}
      accessibilityLabel={card}
      testID={`card-${card}`}
      style={({ pressed }) => [
        styles.card,
        { width, height, borderColor: highlight ? COLORS.accent : '#8a8170', opacity: dimmed ? 0.45 : 1 },
        highlight && { borderWidth: 2 },
        pressed && { transform: [{ translateY: -6 }] },
      ]}
    >
      <Text style={[styles.rank, { color, fontSize: width * 0.3 }]}>{RANK_LABEL[rank]}</Text>
      <View style={styles.center}>
        <Text style={{ fontSize: width * (big ? 0.42 : 0.5) }}>{SUIT_SYMBOL[suit]}</Text>
        {big && <Text style={[styles.face, { color, fontSize: width * 0.22 }]}>{rank === 'O' ? 'Ober' : rank === 'U' ? 'Unter' : 'König'}</Text>}
      </View>
    </Pressable>
  );
}

export function CardBack({ width }: { width: number }) {
  return <View style={[styles.card, styles.back, { width, height: Math.round(width * 1.5) }]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 3,
    paddingTop: 1,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  back: { backgroundColor: '#3b5fa8', borderColor: '#d7e0f5', borderWidth: 2 },
  rank: { fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: -6 },
  face: { fontWeight: '600', marginTop: -2 },
});
