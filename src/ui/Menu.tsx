import React, { useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLORS } from './theme';
import { CardView } from './CardView';

export type MenuChoice = { kind: 'local' } | { kind: 'create' } | { kind: 'join'; code: string };

export function Menu({ name, setName, initialCode, onChoose }: {
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
    <ImageBackground source={require('../../assets/images/holz.jpg')} resizeMode="cover" style={styles.root}>
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
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#2a1810' },
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
  codeInput: { flex: 1, letterSpacing: 4, fontWeight: '700', textAlign: 'center' },
  joinBtn: { paddingHorizontal: 18 },
});
