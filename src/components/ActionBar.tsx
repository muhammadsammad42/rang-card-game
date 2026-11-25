/**
 * ActionBar.tsx — the strip between the table and your hand: your mini seat
 * (with turn glow, dealer chip and bidder crown), what is happening now, the
 * middle-pile streak ("East won the last trick — one more to collect 3"),
 * inline error messages (with a shake), and the "Reveal Rang" button, which
 * appears only when revealing is legal for you.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import type { PlayerProfile } from '@/game/players';
import type { GameState, Seat as SeatId } from '@/game/types';
import { colors, radii, spacing, typography } from '@/theme/theme';

import { AppButton } from './AppButton';
import { Seat } from './Seat';

interface Props {
  game: GameState;
  me: PlayerProfile;
  humanSeat: SeatId;
  isMyTurn: boolean;
  status: string;
  streak: string | null;
  error: { message: string; seq: number } | null;
  canReveal: boolean;
  onReveal: () => void;
}

export function ActionBar({ game, me, humanSeat, isMyTurn, status, streak, error, canReveal, onReveal }: Props) {
  const shake = useSharedValue(0);
  useEffect(() => {
    if (!error) return;
    shake.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 60 }),
      withTiming(-5, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    );
  }, [error, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <View style={styles.bar}>
      <Seat
        player={me}
        size={38}
        minimal
        isTurn={isMyTurn}
        isDealer={game.dealer === humanSeat}
        isBidder={game.bidder === humanSeat}
        cardCount={game.hands[humanSeat].length}
      />
      <View style={styles.texts}>
        {error ? (
          <Animated.Text
            accessibilityLiveRegion="assertive"
            style={[typography.label, styles.error, shakeStyle]}>
            {error.message}
          </Animated.Text>
        ) : (
          <Text style={[typography.label, styles.status, isMyTurn && styles.myTurn]} numberOfLines={2}>
            {status}
          </Text>
        )}
        {streak && (
          <Text style={[typography.caption, styles.streak]} numberOfLines={2} accessibilityLiveRegion="polite">
            {streak}
          </Text>
        )}
      </View>
      {canReveal && (
        <Animated.View entering={FadeIn}>
          <AppButton
            label="Reveal Rang"
            icon="eye-outline"
            size="sm"
            onPress={onReveal}
            accessibilityHint="Turns over the hidden trump card for everyone"
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.hairline,
    minHeight: 58,
  },
  texts: { flex: 1, gap: 2 },
  status: { color: colors.textMuted },
  myTurn: { color: colors.goldLight },
  error: { color: colors.danger },
  streak: { color: colors.ivory },
});
