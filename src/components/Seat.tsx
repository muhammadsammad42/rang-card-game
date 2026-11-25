/**
 * Seat.tsx — one player around the table: avatar, name, team colour, card
 * count, dealer chip, bidder crown, their latest bid (during bidding), and a
 * pulsing gold glow while it is their turn.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { PlayerProfile } from '@/game/players';
import { teamOf } from '@/game/rules';
import { colors, radii, spacing, typography } from '@/theme/theme';

import { Avatar } from './Avatar';

interface Props {
  player: PlayerProfile;
  size: number;
  isTurn: boolean;
  isDealer: boolean;
  isBidder: boolean;
  cardCount: number;
  /** Latest bid shown in a bubble during bidding ("Pass", "9"). */
  bubble?: string | null;
  /** Label under the name, e.g. "Partner". */
  tag?: string;
  /** Avatar + badges only (no name/count rows) — used for the human's mini seat. */
  minimal?: boolean;
}

function SeatBase({ player, size, isTurn, isDealer, isBidder, cardCount, bubble, tag, minimal }: Props) {
  const pulse = useSharedValue(0);

  // Turn indicator: a gold halo that breathes while it's this player's turn.
  useEffect(() => {
    if (isTurn) {
      pulse.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [isTurn, pulse]);

  const halo = useAnimatedStyle(() => ({
    opacity: isTurn ? 0.35 + pulse.value * 0.55 : 0,
    transform: [{ scale: 1 + pulse.value * 0.12 }],
  }));

  const team = teamOf(player.seat);
  const teamColor = team === 'A' ? colors.teamA : colors.teamB;
  const label = `${player.name}${tag ? `, ${tag}` : ''}, ${team === 'A' ? 'your team' : 'opponents'}, ${cardCount} cards${
    isDealer ? ', dealer' : ''
  }${isBidder ? ', bidder' : ''}${isTurn ? ', their turn' : ''}`;

  return (
    <View style={styles.wrap} accessible accessibilityLabel={label}>
      <View style={{ width: size, height: size }}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            { width: size + 16, height: size + 16, borderRadius: (size + 16) / 2, left: -8, top: -8 },
            halo,
          ]}
        />
        <Avatar player={player} size={size} />
        {isBidder && (
          <View style={styles.crown}>
            <MaterialCommunityIcons name="crown" size={size * 0.38} color={colors.goldLight} />
          </View>
        )}
        {isDealer && (
          <View style={[styles.dealer, { width: size * 0.36, height: size * 0.36, borderRadius: size * 0.18 }]}>
            <Text style={[styles.dealerText, { fontSize: size * 0.2 }]}>D</Text>
          </View>
        )}
        {bubble ? (
          <View style={[styles.bubble, bubble === 'Pass' && styles.bubblePass]}>
            <Text style={[typography.label, { color: bubble === 'Pass' ? colors.textMuted : colors.textOnGold }]}>{bubble}</Text>
          </View>
        ) : null}
      </View>
      {!minimal && (
        <>
          <Text numberOfLines={1} style={[typography.label, styles.name, isTurn && { color: colors.goldLight }]}>
            {player.name}
          </Text>
          <View style={styles.metaRow}>
        <View style={[styles.teamDot, { backgroundColor: teamColor }]} />
        <Text style={[typography.caption, styles.meta]}>
          {tag ? `${tag} · ` : ''}
          {cardCount}
        </Text>
        <MaterialCommunityIcons name="cards-playing-outline" size={12} color={colors.textMuted} />
          </View>
        </>
      )}
    </View>
  );
}

export const Seat = memo(SeatBase);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 2 },
  halo: { position: 'absolute', backgroundColor: colors.goldGlow, borderWidth: 2, borderColor: colors.gold },
  crown: { position: 'absolute', top: -14, alignSelf: 'center' },
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
    top: -6,
    right: -26,
    backgroundColor: colors.gold,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  bubblePass: { backgroundColor: colors.nightPanel, borderWidth: 1, borderColor: colors.hairline },
  name: { color: colors.ivory, maxWidth: 96, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  teamDot: { width: 7, height: 7, borderRadius: 4 },
  meta: { color: colors.textMuted },
});
