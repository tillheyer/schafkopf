import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CardId } from '../engine';
import { CardBackFace, CardFace } from './CardFace';

interface Props {
  card: CardId;
  width: number;
  enabled?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
  highlight?: boolean;
}

export function CardView({ card, width, enabled, dimmed, onPress, highlight }: Props) {
  return (
    <Pressable
      disabled={!enabled}
      onPress={onPress}
      accessibilityLabel={card}
      testID={`card-${card}`}
      style={({ pressed }) => [styles.shadow, pressed && { transform: [{ translateY: -6 }] }]}
    >
      <CardFace card={card} width={width} highlight={highlight} />
      {/* Nicht spielbare Karten abtönen, aber deckend lassen, damit nichts durchscheint. */}
      {dimmed && <View pointerEvents="none" style={[styles.dim, { borderRadius: width * 0.07 }]} />}
    </Pressable>
  );
}

export function CardBack({ width }: { width: number }) {
  return (
    <View style={styles.shadow}>
      <CardBackFace width={width} />
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,12,6,0.28)' },
  shadow: {
    borderRadius: 6,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
