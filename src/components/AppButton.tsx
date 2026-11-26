/**
 * AppButton.tsx — the app's button. Gold gradient (primary), glass (secondary),
 * text-only (ghost) or red (danger). Built on PressableScale, so every press
 * shrinks the button with a Reanimated spring and gives a light haptic tick.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ComponentProps, ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, gradients, radii, shadows, spacing, typography } from '@/theme/theme';

import { PressableScale } from './PressableScale';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  children?: ReactNode;
}

const HEIGHT = { sm: 38, md: 48, lg: 56 } as const;

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  style,
  accessibilityHint,
}: Props) {
  const textColor =
    variant === 'primary' ? colors.textOnGold : variant === 'danger' ? colors.ivory : variant === 'ghost' ? colors.gold : colors.ivory;
  const content = (
    <View style={styles.row}>
      {icon && <MaterialCommunityIcons name={icon} size={size === 'sm' ? 16 : 20} color={textColor} />}
      <Text
        numberOfLines={1}
        style={[size === 'sm' ? typography.label : typography.heading, { color: textColor, fontSize: size === 'lg' ? 18 : size === 'sm' ? 13 : 16 }]}>
        {label}
      </Text>
    </View>
  );

  return (
    <PressableScale
      style={[{ opacity: disabled ? 0.4 : 1 }, style]}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}>
      {variant === 'primary' ? (
        <LinearGradient
          colors={gradients.gold}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.base, !disabled && shadows.sm, { height: HEIGHT[size] }]}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.base,
            { height: HEIGHT[size] },
            variant === 'secondary' && styles.secondary,
            variant === 'danger' && styles.danger,
          ]}>
          {content}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  secondary: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder },
  danger: { backgroundColor: 'rgba(239,90,95,0.85)' },
});
