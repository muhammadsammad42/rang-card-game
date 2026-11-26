/**
 * DropZone.tsx — the glowing target in the centre of the table that appears
 * while you drag a card.
 *
 * It reads the shared `dragState` written by the dragged card's gesture
 * worklet (0 idle · 1 dragging · 2 finger over the zone) — no React state, so
 * showing/hiding it costs no re-renders. Its `animatedRef` is what the card
 * measures (Reanimated `measure`, on the UI thread) to know if it's inside.
 */
import { StyleSheet, Text, View } from 'react-native';
import Animated, { AnimatedRef, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { colors, typography } from '@/theme/theme';

import type { DragState } from './Hand';

interface Props {
  size: number;
  zoneRef: AnimatedRef<View>;
  dragState: DragState;
}

export function DropZone({ size, zoneRef, dragState }: Props) {
  const ring = useAnimatedStyle(() => {
    const s = dragState.value;
    return {
      opacity: withTiming(s === 0 ? 0 : s === 2 ? 1 : 0.75, { duration: 140 }),
      transform: [{ scale: withTiming(s === 2 ? 1.08 : s === 1 ? 1 : 0.9, { duration: 160 }) }],
      backgroundColor: s === 2 ? colors.accentGlow : colors.accentSoft,
    };
  });

  return (
    <Animated.View
      ref={zoneRef}
      pointerEvents="none"
      collapsable={false}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, ring]}>
        <Text style={[typography.micro, styles.text]}>Drop to play</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { color: colors.goldLight },
});
