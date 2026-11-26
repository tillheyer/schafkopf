import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

const native = Platform.OS !== 'web';

/**
 * Kurze Einflug-Animation beim ersten Erscheinen: von (dx, dy) an die eigentliche Stelle.
 * Bewusst schnell (≈ 0,2 s), damit der Spielfluss nicht leidet.
 */
export function FlyIn({
  dx = 0,
  dy = 0,
  scaleFrom = 1,
  duration = 200,
  delay = 0,
  animate = true,
  spreadX = false,
  children,
}: {
  dx?: number;
  dy?: number;
  scaleFrom?: number;
  duration?: number;
  delay?: number;
  animate?: boolean;
  /** Erst senkrecht anfliegen, dann seitlich auffächern (fürs Austeilen). */
  spreadX?: boolean;
  children: React.ReactNode;
}) {
  const x = useRef(new Animated.Value(animate ? dx : 0)).current;
  const y = useRef(new Animated.Value(animate ? dy : 0)).current;
  const s = useRef(new Animated.Value(animate ? scaleFrom : 1)).current;

  useEffect(() => {
    if (!animate) return;
    const ease = Easing.out(Easing.cubic);
    const t = (v: Animated.Value, d: number, dl = 0) =>
      Animated.timing(v, { toValue: v === s ? 1 : 0, duration: d, delay: dl, easing: ease, useNativeDriver: native });
    const anim = spreadX
      ? Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([t(y, duration * 0.6), t(s, duration * 0.6)]),
          t(x, duration * 0.4),
        ])
      : Animated.parallel([t(x, duration, delay), t(y, duration, delay), t(s, duration, delay)]);
    anim.start();
    return () => anim.stop();
  }, []);

  return <Animated.View style={{ transform: [{ translateX: x }, { translateY: y }, { scale: s }] }}>{children}</Animated.View>;
}

/**
 * Fertigen Stich einsammeln: alle Karten wandern gemeinsam zum Gewinner und
 * werden dabei kleiner und blasser. Ohne Ziel steht alles normal da.
 */
export function Collect({ to, children }: { to: { dx: number; dy: number } | null; children: React.ReactNode }) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!to) {
      p.setValue(0);
      return;
    }
    const anim = Animated.timing(p, { toValue: 1, duration: 300, easing: Easing.in(Easing.quad), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [to?.dx, to?.dy, to === null]);
  const tx = p.interpolate({ inputRange: [0, 1], outputRange: [0, to?.dx ?? 0] });
  const ty = p.interpolate({ inputRange: [0, 1], outputRange: [0, to?.dy ?? 0] });
  const sc = p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const op = p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.9, 0] });
  return (
    <Animated.View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: op, transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }] }}>
      {children}
    </Animated.View>
  );
}
