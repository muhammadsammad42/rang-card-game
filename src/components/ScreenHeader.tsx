/**
 * ScreenHeader.tsx — back button + title used by History, History Detail and
 * Settings.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/theme';

import { PressableScale } from './PressableScale';

export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <PressableScale
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        haptic="tap"
        accessibilityLabel="Back"
        hitSlop={10}
        contentStyle={styles.back}>
        <MaterialCommunityIcons name="chevron-left" size={26} color={colors.goldLight} />
      </PressableScale>
      <Text style={[typography.title, styles.title]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  title: { color: colors.ivory, flex: 1 },
  right: { minWidth: 40, alignItems: 'flex-end' },
});
