/**
 * BiddingPanel.tsx — the bidding sheet. Shows your 5 cards in a small fan,
 * every player's call as it happens (each new call pops in with a zoom), and
 * large bid chips 8–13 (disabled — dimmed with a lock — unless the bid would
 * be higher than the current highest) plus Pass. Chips only work on your turn
 * and give a press-scale + haptic like every other button.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { sortHand } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import { nextSeat, partnerOf } from '@/game/rules';
import { FIRST_BIDDER_OFFSET, MAX_BID, MIN_BID } from '@/game/rulesConfig';
import type { GameState, Seat } from '@/game/types';
import { colors, radii, shadows, spacing, typography } from '@/theme/theme';

import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { FadeInView } from './FadeInView';
import { Overlay } from './Overlay';
import { PlayingCard } from './PlayingCard';
import { PressableScale } from './PressableScale';

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

  const callFor = (seat: Seat) => game.bids.find((b) => b.seat === seat) ?? null;

  return (
    <Overlay position="bottom" maxWidth={560} scrim={false}>
      <View style={styles.header}>
        <Text style={[typography.title, styles.title]} accessibilityRole="header">
          Bidding
        </Text>
        <View style={styles.highChip}>
          <MaterialCommunityIcons name="crown" size={14} color={colors.goldLight} />
          <Text style={[typography.label, { color: colors.goldLight }]}>
            {highest ? `${highest.value} · ${highest.seat === humanSeat ? 'You' : players[highest.seat].name}` : `Min ${MIN_BID}`}
          </Text>
        </View>
      </View>

      <View style={styles.cards} accessible accessibilityLabel="Your first five cards">
        {hand.map((c, i) => {
          const t = hand.length > 1 ? (i - (hand.length - 1) / 2) / ((hand.length - 1) / 2) : 0;
          return (
            <View
              key={c.id}
              style={{ marginHorizontal: -cardWidth * 0.06, transform: [{ rotate: `${t * 6}deg` }, { translateY: t * t * 6 }] }}>
              <PlayingCard card={c} width={cardWidth} />
            </View>
          );
        })}
      </View>

      <View style={styles.calls}>
        {order.map((seat) => {
          const call = callFor(seat);
          const active = game.turn === seat && !call;
          const me = seat === humanSeat;
          const text = call ? (call.value === 'pass' ? 'Pass' : `Bid ${call.value}`) : active ? (me ? 'Your call' : 'Thinking…') : 'Waiting';
          return (
            <View
              key={seat}
              style={[styles.call, active && styles.callActive]}
              accessible
              accessibilityLabel={`${me ? 'You' : players[seat].name}: ${text}`}>
              <Avatar player={players[seat]} size={26} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted }]}>
                  {me ? 'You' : players[seat].name}
                  {seat === partnerOf(humanSeat) ? ' · partner' : ''}
                </Text>
                {/* Keyed by the call, so a new call remounts and pops in. */}
                <FadeInView key={text} from="zoom" duration={220}>
                  <Text
                    style={[
                      typography.label,
                      {
                        color: call && call.value !== 'pass' ? colors.goldLight : active ? colors.ivory : colors.textDim,
                      },
                    ]}>
                    {text}
                  </Text>
                </FadeInView>
              </View>
            </View>
          );
        })}
      </View>

      <Text style={[typography.caption, styles.hint]}>
        {isHumanTurn
          ? 'How many of the 13 tricks will your team win? Bid higher than the current bid, or pass.'
          : `Waiting for ${players[game.turn].name}…`}
      </Text>

      <View style={styles.bids} accessibilityRole="radiogroup" accessibilityLabel="Bid amount">
        {BID_VALUES.map((v) => {
          const tooLow = v < minimum;
          const disabled = !isHumanTurn || tooLow;
          return (
            <PressableScale
              key={v}
              disabled={disabled}
              onPress={() => onBid(v)}
              sound="none"
              scaleTo={0.9}
              style={styles.bidWrap}
              accessibilityLabel={`Bid ${v} tricks${tooLow ? ', too low' : ''}`}
              contentStyle={[styles.bid, disabled ? styles.bidDisabled : shadows.sm]}>
              <Text style={[styles.bidText, { color: disabled ? colors.textDim : colors.textOnGold }]}>{v}</Text>
              {tooLow && <MaterialCommunityIcons name="lock-outline" size={11} color={colors.textDim} style={styles.lock} />}
            </PressableScale>
          );
        })}
      </View>
      <AppButton label="Pass" icon="hand-back-left-outline" variant="secondary" disabled={!isHumanTurn} onPress={onPass} />
    </Overlay>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  title: { color: colors.ivory, fontSize: 22 },
  highChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.goldDeep,
    backgroundColor: colors.accentSoft,
  },
  cards: { flexDirection: 'row', justifyContent: 'center', paddingVertical: spacing.xs },
  calls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  call: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.nightPanel,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  callActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  hint: { color: colors.textMuted, textAlign: 'center' },
  bids: { flexDirection: 'row', gap: spacing.sm },
  bidWrap: { flex: 1 },
  bid: {
    height: 54,
    borderRadius: radii.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bidDisabled: { backgroundColor: colors.nightPanel, borderWidth: 1, borderColor: colors.hairline },
  bidText: { fontSize: 20, fontWeight: '800' },
  lock: { position: 'absolute', top: 4, right: 5 },
});
