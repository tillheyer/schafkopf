import React from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RULE_LABELS, Rules } from '../engine';
import { COLORS } from './theme';

/** Sonderregeln ein- und ausschalten. Gilt offline und für selbst erstellte Online-Tische. */
export function RulesScreen({ rules, setRules, onBack }: { rules: Rules; setRules: (r: Rules) => void; onBack: () => void }) {
  return (
    <ImageBackground source={require('../../assets/images/holz.jpg')} resizeMode="cover" style={styles.root} imageStyle={styles.bgImage}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.panel}>
          <Text style={styles.title}>Spielregeln</Text>
          <Text style={styles.sub}>
            Sauspiel, Wenz und Farbsolo sind immer dabei. Hier kannst du Sonderspiele dazunehmen. Bei einem Online-Tisch gelten die Regeln des Gastgebers.
          </Text>
          {RULE_LABELS.map(({ key, title, text }) => {
            const on = rules[key];
            return (
              <Pressable
                key={key}
                onPress={() => setRules({ ...rules, [key]: !on })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                testID={`rule-${key}`}
                accessibilityRole="switch"
                accessibilityState={{ checked: on }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{title}</Text>
                  <Text style={styles.rowText}>{text}</Text>
                </View>
                <View style={[styles.toggle, on && styles.toggleOn]}>
                  <View style={[styles.knob, on && styles.knobOn]} />
                </View>
              </Pressable>
            );
          })}
          <Pressable style={styles.btn} onPress={onBack} testID="rules-done">
            <Text style={styles.btnText}>Fertig</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

/** Kurze Liste der eingeschalteten Sonderregeln, z.B. für den Warteraum. */
export function rulesSummary(rules: Rules): string {
  const on = RULE_LABELS.filter((r) => rules[r.key]).map((r) => r.title);
  return on.length ? on.join(', ') : 'nur Standardspiele';
}

const styles = StyleSheet.create({
  bgImage: { width: '100%', height: '100%' },
  root: { overflow: 'hidden', flex: 1, backgroundColor: '#2a1810' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  panel: { width: '100%', maxWidth: 420, backgroundColor: 'rgba(18,9,4,0.85)', borderRadius: 14, padding: 18, gap: 4, borderWidth: 1, borderColor: 'rgba(242,193,78,0.3)' },
  title: { color: COLORS.accent, fontSize: 26, fontWeight: '800', fontFamily: 'Georgia, serif', textAlign: 'center' },
  sub: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  rowTitle: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  rowText: { color: COLORS.muted, fontSize: 12, marginTop: 1 },
  toggle: { width: 46, height: 26, borderRadius: 13, backgroundColor: '#5a4a3a', padding: 3 },
  toggleOn: { backgroundColor: COLORS.accent },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#f5ecd8' },
  knobOn: { transform: [{ translateX: 20 }], backgroundColor: '#2b1a10' },
  btn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#1b1b1b', fontWeight: '800', fontSize: 16 },
});
