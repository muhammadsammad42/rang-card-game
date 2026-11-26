/**
 * AppButton.tsx — the app's button. Gold gradient (primary), glass (secondary),
 * text-only (ghost) or red (danger). Presses shrink the button slightly with a
 * Reanimated spring for tactile feedback.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, gradients, radii, spacing, typography } from '@/theme/theme';

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

const HEIGHT = { sm: 36, md: 46, lg: 56 } as const;

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
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

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
    <Animated.View style={[animated, { opacity: disabled ? 0.4 : 1 }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => {
          scale.set(withSpring(0.95, { damping: 15, stiffness: 400 }));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, { damping: 12, stiffness: 300 }));
        }}
        hitSlop={6}>
        {variant === 'primary' ? (
          <LinearGradient colors={gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.base, { height: HEIGHT[size] }]}>
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
      </Pressable>
    </Animated.View>
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
