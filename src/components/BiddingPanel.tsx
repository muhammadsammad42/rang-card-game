/**
 * BiddingPanel.tsx — the bidding sheet. Shows your 5 cards, every player's
 * call so far (live), and bid buttons 8–13 (disabled unless the bid would be
 * higher than the current highest) plus Pass. Buttons only work on your turn.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { sortHand } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import { nextSeat, partnerOf } from '@/game/rules';
import { FIRST_BIDDER_OFFSET, MAX_BID, MIN_BID } from '@/game/rulesConfig';
import type { GameState, Seat } from '@/game/types';
import { colors, radii, spacing, typography } from '@/theme/theme';

import { AppButton } from './AppButton';
import { Overlay } from './Overlay';
import { PlayingCard } from './PlayingCard';

interface Props {
  game: GameState;
  players: PlayerProfile[];
  humanSeat: Seat;
  isHumanTurn: boolean;
  cardWidth: number;
  onBid: (value: number) => void;
  onPass: () => void;
}

const BID_VALUES = Array.from({ length: MAX_BID - MIN_BID + 1 }, (_, i) => MIN_BID + i);

export function BiddingPanel({ game, players, humanSeat, isHumanTurn, cardWidth, onBid, onPass }: Props) {
  const order = [0, 1, 2, 3].map((k) => nextSeat(game.dealer, FIRST_BIDDER_OFFSET + k));
  const highest = game.highestBid;
  const minimum = highest ? highest.value + 1 : MIN_BID;
  const hand = sortHand(game.hands[humanSeat]);

  const statusFor = (seat: Seat) => {
    const call = game.bids.find((b) => b.seat === seat);
    if (call) return call.value === 'pass' ? 'Pass' : `Bid ${call.value}`;
    if (game.turn === seat) return seat === humanSeat ? 'Your call' : 'Thinking…';
    return 'Waiting';
  };

  return (
    <Overlay position="bottom" maxWidth={560} scrim={false}>
      <View style={styles.header}>
        <Text style={[typography.title, styles.title]}>Bidding</Text>
        <Text style={[typography.label, { color: colors.goldLight }]}>
          {highest ? `Highest: ${highest.value} · ${players[highest.seat].name}` : `No bids yet · min ${MIN_BID}`}
        </Text>
      </View>

      <View style={styles.cards} accessibilityLabel="Your first five cards">
        {hand.map((c) => (
          <PlayingCard key={c.id} card={c} width={cardWidth} />
        ))}
      </View>

      <View style={styles.calls}>
        {order.map((seat) => {
          const status = statusFor(seat);
          const active = game.turn === seat;
          return (
            <View key={seat} style={[styles.call, active && styles.callActive]}>
              <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
                {players[seat].avatar} {seat === humanSeat ? 'You' : players[seat].name}
                {seat === partnerOf(humanSeat) ? ' (partner)' : ''}
              </Text>
              <Text
                style={[typography.label, { color: status.startsWith('Bid') ? colors.goldLight : active ? colors.ivory : colors.textDim }]}>
                {status}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={[typography.caption, styles.hint]}>
        {isHumanTurn
          ? 'How many of the 13 tricks will your team win? Bid higher than the current bid, or pass.'
          : `Waiting for ${players[game.turn].name}…`}
      </Text>

      <View style={styles.bids}>
        {BID_VALUES.map((v) => {
          const disabled = !isHumanTurn || v < minimum;
          return (
            <Pressable
              key={v}
              disabled={disabled}
              onPress={() => onBid(v)}
              accessibilityRole="button"
              accessibilityLabel={`Bid ${v} tricks`}
              accessibilityState={{ disabled }}
              style={({ pressed }) => [styles.bid, disabled && styles.bidDisabled, pressed && styles.bidPressed]}>
              <Text style={[typography.heading, { color: disabled ? colors.textDim : colors.textOnGold }]}>{v}</Text>
            </Pressable>
          );
        })}
      </View>
      <AppButton label="Pass" variant="secondary" disabled={!isHumanTurn} onPress={onPass} />
    </Overlay>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: spacing.sm },
  title: { color: colors.ivory, fontSize: 22 },
  cards: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  calls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  call: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.nightPanel,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  callActive: { borderColor: colors.gold },
  hint: { color: colors.textMuted, textAlign: 'center' },
  bids: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  bid: {
    flex: 1,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidDisabled: { backgroundColor: colors.nightPanel, borderWidth: 1, borderColor: colors.hairline },
  bidPressed: { transform: [{ scale: 0.94 }], backgroundColor: colors.goldLight },
});
