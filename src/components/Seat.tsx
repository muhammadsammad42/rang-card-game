/**
 * Seat.tsx — one player's panel around the table.
 *
 * A frosted panel with the avatar (ringed in the team colour), name, a mini
 * stack of card backs with the card count, the bidder's crown, the dealer
 * chip, their latest bid (during bidding) and — while it is their turn — an
 * animated accent ring around the avatar plus a glowing panel border. Bots
 * also show three bouncing "thinking…" dots on their turn.
 *
 * `minimal` renders only the avatar + badges (the human's mini seat in the
 * status bar). All animations are Reanimated shared values and stop when
 * "Reduce animations" is on.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { PlayerProfile } from '@/game/players';
import { teamOf } from '@/game/rules';
import { useMotion } from '@/hooks/useMotion';
import { colors, radii, spacing, typography } from '@/theme/theme';

import { Avatar } from './Avatar';

interface Props {
  player: PlayerProfile;
  size: number;
  isTurn: boolean;
  isDealer: boolean;
  isBidder: boolean;
  cardCount: number;
  /** Show the bouncing "thinking…" dots (a bot — or a remote player — whose turn it is). */
  thinking?: boolean;
  /** Latest bid shown in a bubble during bidding ("Pass", "9"). */
  bubble?: string | null;
  /** Label under the name, e.g. "Partner". */
  tag?: string;
  /** Avatar + badges only (no panel/name/count) — used for the human's mini seat. */
  minimal?: boolean;
  /** Which side the bid bubble sits on (East uses 'left' so it stays on the table). */
  bubbleSide?: 'left' | 'right';
}

/** Up to three overlapping card backs: a quick visual of how many cards are left. */
function MiniStack({ count }: { count: number }) {
  const layers = Math.min(3, Math.ceil(count / 4));
  return (
    <View style={styles.stack}>
      {Array.from({ length: layers }).map((_, i) => (
        <View key={i} style={[styles.miniBack, { left: i * 3, top: -i * 1.5, transform: [{ rotate: `${(i - 1) * 7}deg` }] }]} />
      ))}
    </View>
  );
}

function Dot({ t, index }: { t: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => {
    // Each dot peaks a third of a cycle after the previous one.
    const phase = (t.value + 1 - index / 3) % 1;
    const up = interpolate(phase, [0, 0.25, 0.5, 1], [0, 1, 0, 0]);
    return { opacity: 0.4 + up * 0.6, transform: [{ translateY: -up * 3 }] };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

function ThinkingDots() {
  const { reduced } = useMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withTiming(1, { duration: 1050, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [t, reduced]);
  return (
    <View style={styles.dots} accessibilityLabel="thinking">
      {[0, 1, 2].map((i) => (
        <Dot key={i} t={t} index={i} />
      ))}
    </View>
  );
}

function SeatBase({
  player,
  size,
  isTurn,
  isDealer,
  isBidder,
  cardCount,
  thinking,
  bubble,
  tag,
  minimal,
  bubbleSide = 'right',
}: Props) {
  const { reduced } = useMotion();
  const pulse = useSharedValue(0);
  const on = useSharedValue(isTurn ? 1 : 0);

  // Turn indicator: an accent ring that breathes while it's this player's turn.
  useEffect(() => {
    on.set(withTiming(isTurn ? 1 : 0, { duration: reduced ? 0 : 220 }));
    if (isTurn && !reduced) {
      pulse.set(withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true));
    } else {
      cancelAnimation(pulse);
      pulse.set(0);
    }
  }, [isTurn, reduced, pulse, on]);

  const ring = useAnimatedStyle(() => ({
    opacity: on.value * (0.55 + pulse.value * 0.45),
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));
  const panelGlow = useAnimatedStyle(() => ({ opacity: on.value }));

  const team = teamOf(player.seat);
  const teamColor = team === 'A' ? colors.teamA : colors.teamB;
  const label = `${player.name}${tag ? `, ${tag}` : ''}, ${team === 'A' ? 'your team' : 'opponents'}, ${cardCount} cards${
    isDealer ? ', dealer' : ''
  }${isBidder ? ', bidder' : ''}${isTurn ? (thinking ? ', thinking' : ', their turn') : ''}`;

  const avatar = (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2, left: -6, top: -6 }, ring]}
      />
      <Avatar player={player} size={size} />
      {isBidder && (
        <View style={styles.crown} accessibilityElementsHidden>
          <MaterialCommunityIcons name="crown" size={size * 0.4} color={colors.goldLight} />
        </View>
      )}
      {isDealer && (
        <View style={[styles.dealer, { width: size * 0.36, height: size * 0.36, borderRadius: size * 0.18 }]}>
          <Text allowFontScaling={false} style={[styles.dealerText, { fontSize: size * 0.2 }]}>
            D
          </Text>
        </View>
      )}
      {bubble ? (
        <View style={[styles.bubble, bubbleSide === 'left' ? { left: -32 } : { right: -28 }, bubble === 'Pass' && styles.bubblePass]}>
          <Text style={[typography.label, { color: bubble === 'Pass' ? colors.textMuted : colors.textOnGold }]}>{bubble}</Text>
        </View>
      ) : null}
    </View>
  );

  if (minimal) {
    return (
      <View accessible accessibilityLabel={label}>
        {avatar}
      </View>
    );
  }

  return (
    <View style={[styles.panel, { minWidth: size + 36 }]} accessible accessibilityLabel={label}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.panelGlow, panelGlow]} />
      {avatar}
      <Text numberOfLines={1} style={[typography.label, styles.name, isTurn && { color: colors.accent }]}>
        {player.name}
      </Text>
      {isTurn && thinking ? (
        <ThinkingDots />
      ) : (
        <View style={styles.metaRow}>
          <View style={[styles.teamDot, { backgroundColor: teamColor }]} />
          <MiniStack count={cardCount} />
          <Text style={[typography.caption, styles.meta]}>
            {cardCount}
            {tag ? ` · ${tag}` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

export const Seat = memo(SeatBase);

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    gap: 3,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(6, 12, 22, 0.55)',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  panelGlow: { borderRadius: radii.lg, borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  ring: { position: 'absolute', borderWidth: 2.5, borderColor: colors.accent, backgroundColor: colors.accentSoft },
  crown: { position: 'absolute', top: -15, alignSelf: 'center' },
  dealer: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    backgroundColor: colors.ivory,
    borderWidth: 1.5,
    borderColor: colors.goldDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerText: { fontWeight: '900', color: colors.suitBlack },
  bubble: {
    position: 'absolute',
    top: -8,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  bubblePass: { backgroundColor: colors.nightPanel, borderWidth: 1, borderColor: colors.hairline },
  name: { color: colors.ivory, maxWidth: 92, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 16 },
  teamDot: { width: 7, height: 7, borderRadius: 4 },
  meta: { color: colors.textMuted },
  stack: { width: 16, height: 14 },
  miniBack: {
    position: 'absolute',
    width: 10,
    height: 14,
    borderRadius: 2,
    backgroundColor: colors.cardBack,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  dots: { flexDirection: 'row', gap: 4, height: 16, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
});
