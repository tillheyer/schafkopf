import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { fullDeck } from '../engine';
import { CardBack, CardView } from './CardView';

/** Übersicht aller Karten (im Browser mit ?karten aufrufen). */
export function CardGallery() {
  return (
    <ScrollView contentContainerStyle={styles.wrap} style={{ backgroundColor: '#2b1a10' }}>
      {fullDeck().map((c) => (
        <View key={c} style={styles.cell}>
          <CardView card={c} width={110} />
        </View>
      ))}
      <View style={styles.cell}>
        <CardBack width={110} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  cell: {},
});
