/**
 * ScoreBoard.tsx — the HUD above the table.
 *
 * TopBar:    pause (or leave) · hand number + session score chips · "Last trick" button.
 * InfoStrip: bid + bidder chip · Rang badge (lock "Rang hidden" that flips
 *            to the suit when revealed) · one progress bar per team towards
 *            what it needs ("Bidders 5 / 8", "Defenders 2 / 6") · a
 *            "result decided" note once the hand is mathematically settled.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ComponentProps, ReactNode, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { SUIT_NAMES } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import { lockedWinner, teamOf } from '@/game/rules';
import type { GameState, Seat, Suit, Team } from '@/game/types';
import { useMotion } from '@/hooks/useMotion';
import { colors, radii, spacing, typography } from '@/theme/theme';
import { teamLabel } from '@/utils/format';

import { PressableScale } from './PressableScale';
import { SuitIcon, suitColorOnDark } from './SuitIcon';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  text,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Optional short caption next to the icon (makes the button a pill). */
  text?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={8}
      haptic="tap"
      style={disabled && { opacity: 0.35 }}
      contentStyle={[styles.iconBtn, text ? styles.iconPill : null]}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.goldLight} />
      {text ? <Text style={[typography.label, { color: colors.goldLight }]}>{text}</Text> : null}
    </PressableScale>
  );
}

export function TopBar({
  game,
  onPause,
  onPeek,
  leftIcon = 'pause',
  leftLabel = 'Pause menu',
  subtitle,
}: {
  game: GameState;
  onPause: () => void;
  onPeek: () => void;
  /** Optional overrides for online play (e.g. a leave button instead of pause). */
  leftIcon?: IconName;
  leftLabel?: string;
  /** Optional element under the score (online: room code + connection). */
  subtitle?: ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      <IconButton icon={leftIcon} label={leftLabel} onPress={onPause} />
      <View style={styles.center}>
        <Text style={[typography.micro, { color: colors.textMuted }]}>Hand {game.handNumber}</Text>
        <View style={styles.scoreRow} accessible accessibilityLabel={`Match score: your team ${game.score.A}, opponents ${game.score.B}`}>
          <View style={[styles.scoreChip, { borderColor: colors.teamA, backgroundColor: colors.teamASoft }]}>
            <Text style={[typography.label, { color: colors.teamA }]}>Us {game.score.A}</Text>
          </View>
          <View style={[styles.scoreChip, { borderColor: colors.teamB, backgroundColor: colors.teamBSoft }]}>
            <Text style={[typography.label, { color: colors.teamB }]}>Them {game.score.B}</Text>
          </View>
        </View>
        {subtitle}
      </View>
      <IconButton
        icon="history"
        text="Last"
        label="Show the last trick"
        onPress={onPeek}
        disabled={game.completedTricks.length === 0}
      />
    </View>
  );
}

/** "Rang hidden" with a lock → flips (rotateY) to the trump suit when revealed. */
function RangBadge({ revealed, suit, secretSuit }: { revealed: boolean; suit: Suit | null; secretSuit: Suit | null }) {
  const { ms } = useMotion();
  const flip = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    flip.set(withTiming(revealed ? 1 : 0, { duration: ms(520), easing: Easing.inOut(Easing.cubic) }));
  }, [revealed, flip, ms]);
  const front = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 400 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const back = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [{ perspective: 400 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));

  const label = revealed && suit ? `Rang revealed: ${SUIT_NAMES[suit]}` : secretSuit ? `Rang hidden. Your secret Rang is ${SUIT_NAMES[secretSuit]}` : 'Rang hidden';
  return (
    <View accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.chip, front]}>
        <MaterialCommunityIcons name="lock-outline" size={14} color={colors.textMuted} />
        <Text style={[typography.label, styles.chipText]}>Rang hidden</Text>
        {secretSuit && <SuitIcon suit={secretSuit} size={12} color={colors.textMuted} />}
      </Animated.View>
      <Animated.View style={[styles.chip, styles.chipRevealed, StyleSheet.absoluteFill, back]}>
        {suit && <SuitIcon suit={suit} size={15} color={suitColorOnDark(suit)} />}
        <Text style={[typography.label, styles.chipText]}>{suit ? SUIT_NAMES[suit] : ''}</Text>
      </Animated.View>
    </View>
  );
}

/** A team's tricks vs. what it needs, with an animated progress bar. */
function TeamProgress({ team, won, need, role }: { team: Team; won: number; need: number | null; role: string | null }) {
  const { ms } = useMotion();
  const color = team === 'A' ? colors.teamA : colors.teamB;
  const pct = need ? Math.min(1, won / need) : 0;
  const fill = useSharedValue(pct);
  useEffect(() => {
    fill.set(withTiming(pct, { duration: ms(450), easing: Easing.out(Easing.cubic) }));
  }, [pct, fill, ms]);
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const done = need !== null && won >= need;

  return (
    <View
      style={[styles.team, { borderColor: done ? color : colors.hairline }]}
      accessible
      accessibilityLabel={`${teamLabel(team)}${role ? `, ${role}` : ''}: ${won} tricks${need !== null ? ` of ${need} needed` : ''}`}>
      <View style={styles.teamHead}>
        <Text style={[typography.micro, { color }]} numberOfLines={1}>
          {team === 'A' ? 'Us' : 'Them'}
          {role ? <Text style={{ color: colors.textMuted }}> · {role}</Text> : null}
        </Text>
        <Text style={[typography.label, { color: colors.ivory }]}>
          {won}
          {need !== null ? <Text style={{ color: colors.textDim }}> / {need}</Text> : null}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color }, bar]} />
      </View>
    </View>
  );
}

export function InfoStrip({ game, players, humanSeat }: { game: GameState; players: PlayerProfile[]; humanSeat: Seat }) {
  const bidder = game.bidder;
  const biddingTeam = bidder !== null ? teamOf(bidder) : null;
  const locked = game.phase === 'PLAYING' ? lockedWinner(game) : null;
  const iAmBidder = bidder === humanSeat;
  // The Rang suit is shown only when revealed, or privately to the human bidder.
  const visibleSuit = game.rangRevealed ? game.rangSuit : null;
  const secretSuit = !game.rangRevealed && iAmBidder ? game.rangSuit : null;

  const need = (team: Team) => (biddingTeam === null || game.bid === null ? null : team === biddingTeam ? game.bid : 14 - game.bid);
  const role = (team: Team) => (biddingTeam === null ? null : team === biddingTeam ? 'Bidders' : 'Defenders');

  return (
    <View style={styles.strip}>
      <View style={styles.chips}>
        <View
          style={[styles.chip, { borderColor: colors.goldDeep }]}
          accessible
          accessibilityLabel={bidder !== null ? `Bid ${game.bid} by ${players[bidder].name}` : 'No bid yet'}>
          <MaterialCommunityIcons name="crown" size={14} color={colors.goldLight} />
          <Text style={[typography.label, styles.chipText]} numberOfLines={1}>
            {bidder !== null
              ? `${bidder === humanSeat ? 'You' : players[bidder].name} bid ${game.bid}`
              : game.highestBid
                ? `High bid ${game.highestBid.value}`
                : game.phase === 'DEAL_5'
                  ? 'Dealing'
                  : 'Bidding'}
          </Text>
        </View>
        {game.phase !== 'DEAL_5' && game.phase !== 'BIDDING' && (
          <RangBadge revealed={game.rangRevealed} suit={visibleSuit} secretSuit={secretSuit} />
        )}
      </View>
      <View style={styles.teams}>
        <TeamProgress team="A" won={game.tricksWon.A} need={need('A')} role={role('A')} />
        <TeamProgress team="B" won={game.tricksWon.B} need={need('B')} role={role('B')} />
      </View>
      {locked && (
        <Text style={[typography.caption, styles.locked]} accessibilityLiveRegion="polite">
          <MaterialCommunityIcons name="lock-check-outline" size={12} color={colors.goldLight} /> Result decided —{' '}
          {locked === biddingTeam ? 'the bid is made' : 'the bid can no longer be made'} ({teamLabel(locked).toLowerCase()} win)
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md },
  center: { alignItems: 'center', gap: 3 },
  scoreRow: { flexDirection: 'row', gap: spacing.xs },
  scoreChip: { paddingHorizontal: spacing.sm + 2, paddingVertical: 2, borderRadius: radii.pill, borderWidth: 1 },
  iconBtn: {
    minWidth: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  iconPill: { paddingHorizontal: spacing.md },
  strip: { paddingHorizontal: spacing.md, gap: spacing.xs + 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.hairline,
    backfaceVisibility: 'hidden',
  },
  chipRevealed: { borderColor: colors.gold, backgroundColor: colors.glassStrong },
  chipText: { color: colors.ivory, maxWidth: 150 },
  teams: { flexDirection: 'row', gap: spacing.sm },
  team: {
    flex: 1,
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: radii.md,
    backgroundColor: colors.glass,
    borderWidth: 1,
  },
  teamHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  locked: { color: colors.goldLight, textAlign: 'center' },
});
