/**
 * ActionBar.tsx — the status bar between the table and your hand.
 *
 *  - your mini seat (turn ring, dealer chip, bidder crown);
 *  - one short status message with an icon for its tone ("Your turn: follow
 *    ♣ Clubs" ✋, "Waiting for Hassan…" 🕑, "Abdullah wins trick 4" 🏆…);
 *  - error / hint messages in red with a shake ("You must follow ♦ Diamonds");
 *  - the "Reveal Rang" button, only when revealing is legal for you. When you
 *    can't follow suit it pulses and shows a one-line hint;
 *  - the Sort toggle (by suit ↔ by rank) for your hand.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ComponentProps, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { PlayerProfile } from '@/game/players';
import { canFollowSuit, ledSuit } from '@/game/rules';
import type { GameState, Seat as SeatId } from '@/game/types';
import { useMotion } from '@/hooks/useMotion';
import { colors, radii, spacing, typography } from '@/theme/theme';
import type { HandSort } from '@/utils/handView';
import type { StatusInfo, StatusTone } from '@/utils/status';

import { AppButton } from './AppButton';
import { FadeInView } from './FadeInView';
import { PressableScale } from './PressableScale';
import { Seat } from './Seat';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TONE: Record<StatusTone, { icon: IconName; color: string }> = {
  turn: { icon: 'hand-pointing-up', color: colors.accent },
  wait: { icon: 'timer-sand', color: colors.textMuted },
  win: { icon: 'trophy-outline', color: colors.success },
  lose: { icon: 'arrow-top-right', color: colors.teamB },
  pile: { icon: 'layers-outline', color: colors.goldLight },
  deal: { icon: 'cards-outline', color: colors.textMuted },
  info: { icon: 'information-outline', color: colors.textMuted },
};

interface Props {
  game: GameState;
  me: PlayerProfile;
  humanSeat: SeatId;
  isMyTurn: boolean;
  status: StatusInfo;
  /** An engine/host error or an illegal-tap hint (shown in red, with a shake). */
  error: { message: string; seq: number } | null;
  canReveal: boolean;
  onReveal: () => void;
  sortMode: HandSort;
  onToggleSort: () => void;
}

export function ActionBar({ game, me, humanSeat, isMyTurn, status, error, canReveal, onReveal, sortMode, onToggleSort }: Props) {
  const { reduced } = useMotion();

  const shake = useSharedValue(0);
  useEffect(() => {
    if (!error || reduced) return;
    shake.set(
      withSequence(
        withTiming(-8, { duration: 50 }),
        withTiming(8, { duration: 60 }),
        withTiming(-5, { duration: 60 }),
        withTiming(0, { duration: 50 }),
      ),
    );
  }, [error, shake, reduced]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  // "Reveal Rang" pulses when you can't follow suit (the moment revealing matters most).
  const led = ledSuit(game.currentTrick);
  const cannotFollow = led !== null && !canFollowSuit(game.hands[humanSeat], game.currentTrick);
  const urgent = canReveal && cannotFollow;
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (urgent && !reduced) pulse.set(withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true));
    else {
      cancelAnimation(pulse);
      pulse.set(0);
    }
  }, [urgent, reduced, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.06 }] }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: pulse.value * 0.8, transform: [{ scale: 1 + pulse.value * 0.12 }] }));

  const tone = TONE[status.tone];
  const revealHint = cannotFollow ? 'Tip: reveal to trump it' : 'You may reveal any time';

  return (
    <View style={styles.bar}>
      <Seat
        player={me}
        size={36}
        minimal
        isTurn={isMyTurn}
        isDealer={game.dealer === humanSeat}
        isBidder={game.bidder === humanSeat}
        cardCount={game.hands[humanSeat].length}
      />
      <View style={styles.texts}>
        {error ? (
          <Animated.View style={[styles.line, shakeStyle]}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text accessibilityLiveRegion="assertive" style={[typography.label, styles.error]} numberOfLines={2}>
              {error.message}
            </Text>
          </Animated.View>
        ) : (
          <View style={styles.line}>
            <MaterialCommunityIcons name={tone.icon} size={16} color={tone.color} />
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.label, styles.status, status.tone === 'turn' && styles.myTurn]}
              numberOfLines={2}>
              {status.text}
            </Text>
          </View>
        )}
        {canReveal && (
          <Text style={[typography.caption, styles.hint]} numberOfLines={1}>
            {revealHint}
          </Text>
        )}
      </View>
      {canReveal ? (
        <FadeInView from="zoom">
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.revealHalo, haloStyle]} />
          <Animated.View style={pulseStyle}>
            <AppButton
              label="Reveal Rang"
              icon="eye-outline"
              size="sm"
              onPress={onReveal}
              accessibilityHint="Turns over the hidden trump card for everyone"
            />
          </Animated.View>
        </FadeInView>
      ) : (
        <PressableScale
          onPress={onToggleSort}
          haptic="none"
          accessibilityLabel={`Sort hand: by ${sortMode}. Tap to sort by ${sortMode === 'suit' ? 'rank' : 'suit'}`}
          contentStyle={styles.sort}>
          <MaterialCommunityIcons name={sortMode === 'suit' ? 'cards-club-outline' : 'sort-numeric-descending'} size={16} color={colors.goldLight} />
          <Text style={[typography.micro, { color: colors.goldLight }]}>{sortMode === 'suit' ? 'Suit' : 'Rank'}</Text>
        </PressableScale>
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
    minHeight: 60,
  },
  texts: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  status: { color: colors.textMuted, flexShrink: 1 },
  myTurn: { color: colors.accent },
  error: { color: colors.danger, flexShrink: 1 },
  hint: { color: colors.goldLight },
  revealHalo: { borderRadius: radii.pill, backgroundColor: colors.accentGlow },
  sort: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    height: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.nightPanel,
  },
});
