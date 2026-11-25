/**
 * ScoreBoard.tsx — the two information bars above the table.
 *
 * TopBar:   pause button · hand number · match score (hands won) · last-trick peek.
 * InfoStrip: bid + bidder (crown) · Rang status (lock "Hidden" or the revealed
 *            suit) · tricks per team vs. what they need · "result decided" hint.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SUIT_NAMES } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import { lockedWinner, teamOf } from '@/game/rules';
import type { GameState, Seat, Team } from '@/game/types';
import { colors, radii, spacing, typography } from '@/theme/theme';
import { teamLabel } from '@/utils/format';

import { SuitIcon, suitColorOnDark } from './SuitIcon';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

function IconButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }, disabled && { opacity: 0.35 }]}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.goldLight} />
    </Pressable>
  );
}

export function TopBar({
  game,
  onPause,
  onPeek,
}: {
  game: GameState;
  onPause: () => void;
  onPeek: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <IconButton icon="pause" label="Pause menu" onPress={onPause} />
      <View style={styles.center}>
        <Text style={[typography.micro, { color: colors.textMuted }]}>Hand {game.handNumber}</Text>
        <Text style={[typography.heading, { color: colors.ivory }]} accessibilityLabel={`Match score: your team ${game.score.A}, opponents ${game.score.B}`}>
          <Text style={{ color: colors.teamA }}>Us {game.score.A}</Text>
          <Text style={{ color: colors.textDim }}>{'  –  '}</Text>
          <Text style={{ color: colors.teamB }}>{game.score.B} Them</Text>
        </Text>
      </View>
      <IconButton icon="eye-outline" label="Show last trick" onPress={onPeek} disabled={game.completedTricks.length === 0} />
    </View>
  );
}

function Chip({ children, accent, label }: { children: ReactNode; accent?: string; label: string }) {
  return (
    <View style={[styles.chip, accent ? { borderColor: accent } : null]} accessible accessibilityLabel={label}>
      {children}
    </View>
  );
}

export function InfoStrip({ game, players, humanSeat }: { game: GameState; players: PlayerProfile[]; humanSeat: Seat }) {
  const bidder = game.bidder;
  const biddingTeam = bidder !== null ? teamOf(bidder) : null;
  const locked = game.phase === 'PLAYING' ? lockedWinner(game) : null;
  const iAmBidder = bidder === humanSeat;
  // The Rang suit is shown only when revealed, or privately to the human bidder.
  const visibleSuit = game.rangRevealed || iAmBidder ? game.rangSuit : null;

  const need = (team: Team) => (biddingTeam === null || game.bid === null ? null : team === biddingTeam ? game.bid : 14 - game.bid);

  return (
    <View style={styles.strip}>
      <View style={styles.chips}>
        <Chip label={bidder !== null ? `Bid ${game.bid} by ${players[bidder].name}` : 'No bid yet'} accent={colors.goldDeep}>
          <MaterialCommunityIcons name="crown" size={14} color={colors.goldLight} />
          <Text style={[typography.label, styles.chipText]} numberOfLines={1}>
            {bidder !== null ? `${players[bidder].name} · ${game.bid}` : game.highestBid ? `High ${game.highestBid.value}` : 'Bidding'}
          </Text>
        </Chip>

        <Chip
          label={
            game.rangRevealed && visibleSuit
              ? `Rang revealed: ${SUIT_NAMES[visibleSuit]}`
              : iAmBidder && visibleSuit
                ? `Rang hidden. Your secret Rang is ${SUIT_NAMES[visibleSuit]}`
                : 'Rang hidden'
          }
          accent={game.rangRevealed ? colors.gold : undefined}>
          {game.rangRevealed && visibleSuit ? (
            <>
              <SuitIcon suit={visibleSuit} size={14} color={suitColorOnDark(visibleSuit)} />
              <Text style={[typography.label, styles.chipText]}>Rang</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="lock-outline" size={14} color={colors.textMuted} />
              <Text style={[typography.label, styles.chipText]}>Hidden</Text>
              {iAmBidder && visibleSuit && <SuitIcon suit={visibleSuit} size={12} color={colors.textMuted} />}
            </>
          )}
        </Chip>

        {(['A', 'B'] as const).map((team) => {
          const n = need(team);
          const color = team === 'A' ? colors.teamA : colors.teamB;
          return (
            <Chip
              key={team}
              accent={color}
              label={`${teamLabel(team)}: ${game.tricksWon[team]} tricks${n !== null ? ` of ${n} needed` : ''}`}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={[typography.label, styles.chipText]}>
                {game.tricksWon[team]}
                {n !== null ? <Text style={{ color: colors.textDim }}>/{n}</Text> : null}
              </Text>
            </Chip>
          );
        })}
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
  center: { alignItems: 'center' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strip: { paddingHorizontal: spacing.md, gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipText: { color: colors.ivory, maxWidth: 110 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  locked: { color: colors.goldLight, textAlign: 'center' },
});
