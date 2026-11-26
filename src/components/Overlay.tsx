/**
 * Overlay.tsx — a dimmed full-screen layer with an animated panel, used by
 * every in-game dialog (bidding, Rang picker, pause menu, results…).
 * `position="bottom"` slides a sheet up; `"center"` zooms a card in.
 */
import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing } from '@/theme/theme';

import { FadeInView } from './FadeInView';

interface Props {
  children: ReactNode;
  position?: 'center' | 'bottom';
  /** Max panel width (keeps dialogs readable on tablets). */
  maxWidth?: number;
  /** Darken the background (false lets the table stay visible and usable, e.g. during bidding). */
  scrim?: boolean;
}

export function Overlay({ children, position = 'center', maxWidth = 440, scrim = true }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <FadeInView
      duration={180}
      // Without a scrim, touches outside the panel pass through to the table (e.g. the pause button).
      pointerEvents={scrim ? 'auto' : 'box-none'}
      style={[
        StyleSheet.absoluteFill,
        styles.layer,
        scrim && { backgroundColor: colors.scrim },
        position === 'bottom'
          ? { justifyContent: 'flex-end', paddingBottom: insets.bottom + spacing.sm }
          : { justifyContent: 'center', paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <FadeInView
        from={position === 'bottom' ? 'up' : 'zoom'}
        distance={60}
        duration={260}
        style={[styles.panel, { maxWidth }]}>
        <View style={styles.inner} accessibilityViewIsModal>
          {children}
        </View>
      </FadeInView>
    </FadeInView>
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
  inner: { padding: spacing.lg, gap: spacing.md },
});
