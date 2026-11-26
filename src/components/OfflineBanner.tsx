/**
 * OfflineBanner.tsx — a slim warning strip shown when the device has no
 * internet (online play needs it; single-player keeps working).
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme/theme';

import { FadeInView } from './FadeInView';

export function OfflineBanner({ message = 'You are offline — online play needs an internet connection.' }: { message?: string }) {
  return (
    <FadeInView from="down" style={styles.banner}>
      <MaterialCommunityIcons name="wifi-off" size={18} color={colors.warning} />
      <Text style={[typography.label, styles.text]} accessibilityLiveRegion="polite">
        {message}
      </Text>
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(245,181,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,181,68,0.45)',
  },
  text: { color: colors.ivory, flex: 1 },
});
