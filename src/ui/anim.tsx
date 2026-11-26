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
