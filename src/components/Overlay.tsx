/**
 * Overlay.tsx — a dimmed full-screen layer with an animated panel, used by
 * every in-game dialog (bidding, Rang picker, pause menu, results…).
 * `position="bottom"` slides a sheet up; `"center"` zooms a card in.
 */
import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing } from '@/theme/theme';

interface Props {
  children: ReactNode;
  position?: 'center' | 'bottom';
  /** Max panel width (keeps dialogs readable on tablets). */
  maxWidth?: number;
  /** Darken the background (false lets the table stay visible, e.g. during bidding). */
  scrim?: boolean;
}

export function Overlay({ children, position = 'center', maxWidth = 440, scrim = true }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={[
        StyleSheet.absoluteFill,
        styles.layer,
        scrim && { backgroundColor: colors.scrim },
        position === 'bottom' ? { justifyContent: 'flex-end', paddingBottom: insets.bottom + spacing.sm } : { justifyContent: 'center' },
      ]}>
      <Animated.View
        entering={position === 'bottom' ? SlideInDown.springify().damping(18) : ZoomIn.duration(220)}
        exiting={position === 'bottom' ? SlideOutDown.duration(180) : ZoomOut.duration(150)}
        style={[styles.panel, { maxWidth }, position === 'bottom' && styles.sheet]}
        accessibilityViewIsModal>
        <View style={styles.inner}>{children}</View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 50, alignItems: 'center', paddingHorizontal: spacing.md },
  panel: {
    width: '100%',
    backgroundColor: colors.glassStrong,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadows.lg,
  },
  sheet: { borderRadius: radii.xl },
  inner: { padding: spacing.lg, gap: spacing.md },
});
