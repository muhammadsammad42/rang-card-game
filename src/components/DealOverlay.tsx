/**
 * DealOverlay.tsx — the dealing animation. Card backs fly one at a time from
 * the dealer to each player (clockwise, starting left of the dealer). Purely
 * visual: GameProvider dispatches FINISH_DEAL on its own timer, so the game
 * can never get stuck waiting for an animation callback.
 */
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { nextSeat } from '@/game/rules';
import type { Seat } from '@/game/types';
import { CARD_RATIO } from '@/hooks/useLayout';

import { CardBack } from './PlayingCard';

export type Point = { x: number; y: number };

interface Props {
  dealer: Seat;
  /** Total cards to deal (20 for the first deal, 32 for the second). */
  count: number;
  stagger: number;
  /** Centre point of each seat (index = seat), in the overlay's coordinates. */
  seatPoints: Point[];
  cardWidth: number;
}

const FlyingCard = memo(function FlyingCard({
  from,
  to,
  delay,
  cardWidth,
}: {
  from: Point;
  to: Point;
  delay: number;
  cardWidth: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }));
  }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : t.value < 0.85 ? 1 : (1 - t.value) / 0.15,
    transform: [
      { translateX: from.x + (to.x - from.x) * t.value - cardWidth / 2 },
      { translateY: from.y + (to.y - from.y) * t.value - (cardWidth * CARD_RATIO) / 2 },
      { rotate: `${t.value * 360}deg` },
    ],
  }));
  return (
    <Animated.View style={[styles.card, { width: cardWidth, height: cardWidth * CARD_RATIO }, style]}>
      <CardBack width={cardWidth} />
    </Animated.View>
  );
});

function DealOverlayBase({ dealer, count, stagger, seatPoints, cardWidth }: Props) {
  if (seatPoints.length < 4) return null;
  const from = seatPoints[dealer];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityLabel="Dealing cards">
      {Array.from({ length: count }).map((_, i) => (
        <FlyingCard
          key={i}
          from={from}
          to={seatPoints[nextSeat(dealer, (i % 4) + 1)]}
          delay={i * stagger}
          cardWidth={cardWidth}
        />
      ))}
    </View>
  );
}

export const DealOverlay = memo(DealOverlayBase);

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 0, top: 0 },
});
