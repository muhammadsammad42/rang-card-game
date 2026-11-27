/**
 * PressableScale.tsx — the app's micro-interaction for anything tappable.
 *
 * Shrinks slightly while pressed (Reanimated spring on the UI thread) and
 * gives a light haptic tick on press. Used by AppButton, icon buttons, bid
 * chips, segmented options, list rows… so every control feels the same.
 * With "Reduce animations" on, the scale is skipped (haptics still work).
 */
import { ReactNode } from 'react';
import { AccessibilityState, Insets, Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useFeedback } from '@/hooks/useFeedback';
import { useSound } from '@/hooks/useSound';
import { useMotion } from '@/hooks/useMotion';
import { motion } from '@/theme/theme';

interface Props {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Style of the animated outer wrapper (layout: flex, margins, width). */
  style?: StyleProp<ViewStyle>;
  /** Style of the pressable surface itself. */
  contentStyle?: StyleProp<ViewStyle> | ((pressed: boolean) => StyleProp<ViewStyle>);
  /** How far it shrinks (default theme motion.press = 0.95). */
  scaleTo?: number;
  haptic?: 'tap' | 'press' | 'none';
  /** Sound on press (default: the soft tap). 'none' when the action makes its own sound. */
  sound?: 'tap' | 'none';
  hitSlop?: number | Insets;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'radio' | 'tab' | 'link';
  accessibilityState?: AccessibilityState;
}

export function PressableScale({
  children,
  onPress,
  disabled,
  style,
  contentStyle,
  scaleTo = motion.press,
  haptic = 'press',
  sound = 'tap',
  hitSlop,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
}: Props) {
  const scale = useSharedValue(1);
  const { reduced } = useMotion();
  const feedback = useFeedback();
  const sfx = useSound();
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[style, animated]}>
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
        disabled={disabled}
        hitSlop={hitSlop}
        onPress={() => {
          if (haptic !== 'none') feedback[haptic]();
          if (sound !== 'none') sfx(sound);
          onPress?.();
        }}
        onPressIn={() => {
          if (!reduced) scale.set(withSpring(scaleTo, motion.spring));
        }}
        onPressOut={() => {
          scale.set(reduced ? 1 : withSpring(1, motion.spring));
        }}
        style={typeof contentStyle === 'function' ? ({ pressed }) => contentStyle(pressed) : contentStyle}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
