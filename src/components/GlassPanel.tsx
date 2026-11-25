/**
 * GlassPanel.tsx — the frosted, gold-edged panel used for every card-like
 * surface (stats, dialogs, history rows).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { colors, gradients, radii, shadows, spacing } from '@/theme/theme';

export function GlassPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={gradients.panel} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.panel, style]}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing.lg,
    ...shadows.md,
  },
});
