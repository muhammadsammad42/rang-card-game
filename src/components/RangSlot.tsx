/**
 * RangSlot.tsx — the face-down Rang card on the table.
 *
 * Before the reveal everyone sees a card back (the human bidder also sees a
 * small "yours" badge with the suit, because they chose it). When the Rang is
 * revealed the card flips over in 3D (Reanimated) with a LottieFiles burst,
 * then settles into a gold medallion showing the trump suit.
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { SUIT_NAMES } from '@/game/deck';
import type { Card, Suit } from '@/game/types';
import { colors, radii, spacing, typography } from '@/theme/theme';

import { LottieAnim } from './LottieAnim';
import { PlayingCard } from './PlayingCard';
import { SuitIcon, suitColorOnDark } from './SuitIcon';

interface Props {
  /** Is there a Rang on the table yet (after CHOOSE_RANG)? */
  placed: boolean;
  revealed: boolean;
  /** The face-down card — only passed when the viewer may know it. */
  card: Card | null;
  /** The suit, if the viewer may know it (revealed, or the human is the bidder). */
  knownSuit: Suit | null;
  /** True if the human is the bidder (shows the private "yours" badge). */
  mine: boolean;
  revealSeq: number;
  cardWidth: number;
}

function RangSlotBase({ placed, revealed, card, knownSuit, mine, revealSeq, cardWidth }: Props) {
  const flip = useSharedValue(revealed ? 1 : 0);
  const settle = useSharedValue(revealed ? 1 : 0);
  /** The reveal whose burst has finished. Starts at the current value so remounting never replays an old burst. */
  const [burstDone, setBurstDone] = useState(revealSeq);
  const showBurst = revealed && revealSeq > 0 && revealSeq !== burstDone;

  useEffect(() => {
    if (revealSeq === 0 || !revealed) return;
    // Flip the card face up, then fade it into the suit medallion.
    flip.set(0);
    settle.set(0);
    flip.set(withTiming(1, { duration: 600, easing: Easing.inOut(Easing.cubic) }));
    settle.set(withDelay(1500, withTiming(1, { duration: 400 })));
  }, [revealSeq, revealed, flip, settle]);

  // A new hand: back to face down.
  useEffect(() => {
    if (!revealed) {
      flip.set(0);
      settle.set(0);
    }
  }, [revealed, flip, settle]);

  const backStyle = useAnimatedStyle(() => ({
    opacity: flip.value < 0.5 ? 1 : 0,
    transform: [{ perspective: 600 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
  }));
  const faceStyle = useAnimatedStyle(() => ({
    opacity: (flip.value >= 0.5 ? 1 : 0) * (1 - settle.value),
    transform: [{ perspective: 600 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
  }));
  const medalStyle = useAnimatedStyle(() => ({ opacity: settle.value, transform: [{ scale: 0.7 + settle.value * 0.3 }] }));

  if (!placed) return null;
  const w = cardWidth * 0.62;
  const label = revealed && knownSuit ? `Rang revealed: ${SUIT_NAMES[knownSuit]}` : mine && knownSuit ? `Your hidden Rang: ${SUIT_NAMES[knownSuit]}` : 'Rang hidden';

  return (
    <View style={styles.wrap} accessible accessibilityLabel={label}>
      <View style={{ width: w, height: w * 1.4 }}>
        <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>
          <PlayingCard faceDown width={w} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, faceStyle]}>
          {card && <PlayingCard card={card} width={w} />}
        </Animated.View>
        {revealed && knownSuit && (
          <Animated.View style={[StyleSheet.absoluteFill, styles.medal, { borderRadius: w * 0.14 }, medalStyle]}>
            <SuitIcon suit={knownSuit} size={w * 0.62} color={suitColorOnDark(knownSuit)} />
          </Animated.View>
        )}
        {!revealed && mine && knownSuit && (
          <View style={styles.mine}>
            <SuitIcon suit={knownSuit} size={12} color={colors.textOnGold} />
          </View>
        )}
        {showBurst && (
          <View pointerEvents="none" style={styles.burst}>
            <LottieAnim
              key={revealSeq}
              name="rangReveal"
              loop={false}
              style={{ width: w * 4, height: w * 4 }}
              onFinish={() => setBurstDone(revealSeq)}
            />
          </View>
        )}
      </View>
      <Text style={[typography.micro, styles.caption]}>{revealed ? 'Rang' : mine ? 'Your Rang' : 'Rang ?'}</Text>
    </View>
  );
}

export const RangSlot = memo(RangSlotBase);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs },
  caption: { color: colors.goldLight },
  medal: {
    backgroundColor: colors.nightPanel,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mine: {
    position: 'absolute',
    right: -6,
    top: -6,
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    padding: 3,
  },
  burst: {
    position: 'absolute',
    left: -200,
    right: -200,
    top: -200,
    bottom: -200,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
