import React, { useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS } from './theme';
import { CardView } from './CardView';
import { Rules } from '../engine';
import { rulesSummary } from './RulesScreen';

export type MenuChoice = { kind: 'local' } | { kind: 'create' } | { kind: 'join'; code: string } | { kind: 'rules' };

export function Menu({ name, setName, initialCode, rules, sound, setSound, onChoose }: {
  rules: Rules;
  sound: boolean;
  setSound: (on: boolean) => void;
  name: string;
  setName: (n: string) => void;
  initialCode: string;
  onChoose: (c: MenuChoice) => void;
}) {
  const [code, setCode] = useState(initialCode);
  const [joining, setJoining] = useState(!!initialCode);
  const nameOk = name.trim().length > 0;
  const codeOk = /^[A-Z0-9]{4}$/.test(code);

  return (
    <ImageBackground source={require('../../assets/images/holz.jpg')} resizeMode="cover" style={styles.root} imageStyle={styles.bgImage}>
      <View style={styles.fan}>
        {(['GU', 'EO', 'HA', 'SO'] as const).map((c, i) => (
          <View key={c} style={{ transform: [{ rotate: `${(i - 1.5) * 12}deg` }, { translateY: Math.abs(i - 1.5) * 6 }], marginHorizontal: -10 }}>
            <CardView card={c} width={70} />
          </View>
        ))}
      </View>
      <Text style={styles.title}>Schafkopf</Text>
      <Text style={styles.sub}>Bayerisches Blatt · 32 Karten</Text>

      <View style={styles.panel}>
        <Text style={styles.label}>Dein Name</Text>
        <TextInput
          id="name"
          testID="name"
          value={name}
          onChangeText={setName}
          placeholder="z.B. Till"
          placeholderTextColor="#8a7a63"
          maxLength={16}
          style={styles.input}
        />

        <Pressable style={[styles.btn, !nameOk && styles.off]} disabled={!nameOk} onPress={() => onChoose({ kind: 'local' })} testID="menu-local">
          <Text style={styles.btnText}>Allein gegen den Computer</Text>
        </Pressable>
        <Pressable style={[styles.btn, !nameOk && styles.off]} disabled={!nameOk} onPress={() => onChoose({ kind: 'create' })} testID="menu-create">
          <Text style={styles.btnText}>Online-Tisch erstellen</Text>
        </Pressable>

        {!joining ? (
          <Pressable style={[styles.btnGhost, !nameOk && styles.off]} disabled={!nameOk} onPress={() => setJoining(true)} testID="menu-join-open">
            <Text style={styles.btnGhostText}>Tisch mit Code beitreten</Text>
          </Pressable>
        ) : (
          <View style={styles.joinRow}>
            <TextInput
              id="code"
              testID="code"
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="CODE"
              placeholderTextColor="#8a7a63"
              autoCapitalize="characters"
              style={[styles.input, styles.codeInput]}
            />
            <Pressable
              style={[styles.btn, styles.joinBtn, (!nameOk || !codeOk) && styles.off]}
              disabled={!nameOk || !codeOk}
              onPress={() => onChoose({ kind: 'join', code })}
              testID="menu-join"
            >
              <Text style={styles.btnText}>Beitreten</Text>
            </Pressable>
          </View>
        )}
        <Pressable style={styles.rulesBtn} onPress={() => onChoose({ kind: 'rules' })} testID="menu-rules">
          <Text style={styles.rulesTitle}>Spielregeln ›</Text>
          <Text style={styles.rulesText} numberOfLines={2}>{rulesSummary(rules)}</Text>
        </Pressable>
        <Pressable
          style={styles.soundRow}
          onPress={() => setSound(!sound)}
          testID="menu-sound"
          accessibilityRole="switch"
          accessibilityState={{ checked: sound }}
        >
          <Text style={styles.soundLabel}>Töne</Text>
          <View style={[styles.switch, sound && styles.switchOn]}>
            <View style={[styles.knob, sound && styles.knobOn]} />
          </View>
        </Pressable>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bgImage: { width: '100%', height: '100%' },
  root: { overflow: 'hidden',  flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#2a1810' },
  fan: { flexDirection: 'row', marginBottom: 18 },
  title: { color: COLORS.accent, fontSize: 40, fontWeight: '800', fontFamily: 'Georgia, serif', textShadowColor: '#000', textShadowRadius: 6 },
  sub: { color: COLORS.muted, marginBottom: 24 },
  panel: { width: '100%', maxWidth: 360, backgroundColor: 'rgba(18,9,4,0.75)', borderRadius: 14, padding: 18, gap: 10, borderWidth: 1, borderColor: 'rgba(242,193,78,0.3)' },
  label: { color: COLORS.text, fontWeight: '600' },
  input: { backgroundColor: '#fbf4e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#2a1a10' },
  btn: { backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#1b1b1b', fontWeight: '800', fontSize: 16 },
  btnGhost: { borderRadius: 10, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: COLORS.muted },
  btnGhostText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  off: { opacity: 0.45 },
  joinRow: { flexDirection: 'row', gap: 8 },
  codeInput: { flex: 1, minWidth: 0, width: 0, letterSpacing: 4, fontWeight: '700', textAlign: 'center' },
  joinBtn: { paddingHorizontal: 18 },
  rulesBtn: { marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(242,193,78,0.2)', alignItems: 'center' },
  rulesTitle: { color: COLORS.accent, fontWeight: '700', fontSize: 15 },
  soundRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 4 },
  soundLabel: { color: COLORS.text, fontWeight: '600', fontSize: 15 },
  switch: { width: 42, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', padding: 3 },
  switchOn: { backgroundColor: COLORS.accent },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fbf4e2' },
  knobOn: { transform: [{ translateX: 18 }] },
  rulesText: { color: COLORS.muted, fontSize: 12, textAlign: 'center', marginTop: 2 },
});
