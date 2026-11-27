/**
 * Segmented.tsx — a small segmented control (e.g. Easy | Normal) used on the
 * Settings screen. Each option has the shared press-scale + haptic.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/theme/theme';

import { PressableScale } from './PressableScale';

interface Props<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  accessibilityLabel: string;
}

export function Segmented<T extends string>({ value, options, onChange, accessibilityLabel }: Props<T>) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => onChange(o.value)}
            haptic="tap"
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={o.label}
            style={styles.flex}
            contentStyle={[styles.option, active && styles.active]}>
            <Text style={[typography.label, { color: active ? colors.textOnGold : colors.textMuted }]}>{o.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.nightPanel,
    borderRadius: radii.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  flex: { flex: 1 },
  option: { alignItems: 'center', paddingVertical: spacing.sm + 2, borderRadius: radii.pill },
  active: { backgroundColor: colors.gold },
});
