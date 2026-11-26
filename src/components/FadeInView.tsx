/**
 * FadeInView.tsx — fades (and optionally slides/zooms) its children in when
 * mounted, using a Reanimated shared value driven from useEffect.
 *
 * We use this instead of Reanimated's `entering` layout animations because
 * those occasionally stayed stuck at opacity 0 in Expo Go; a plain shared
 * value + withTiming is simple and always completes.
 */
import { ReactNode, useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

interface Props {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'fade' only, 'up' slides up from below, 'down' slides down from above, 'zoom' scales in. */
  from?: 'fade' | 'up' | 'down' | 'zoom';
  /** Slide distance for 'up'/'down' (px). */
  distance?: number;
  duration?: number;
  delay?: number;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

export function FadeInView({ children, style, from = 'fade', distance = 24, duration = 260, delay = 0, pointerEvents }: Props) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
  }, [t, delay, duration]);

  const animated = useAnimatedStyle(() => {
    const offset = (1 - t.value) * distance;
    return {
      opacity: t.value,
      transform: [
        { translateY: from === 'up' ? offset : from === 'down' ? -offset : 0 },
        { scale: from === 'zoom' ? 0.92 + 0.08 * t.value : 1 },
      ],
    };
  });

  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, animated]}>
      {children}
    </Animated.View>
  );
}
