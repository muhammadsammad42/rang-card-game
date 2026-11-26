/**
 * TrickArea.tsx — the centre of the table where the current trick is played.
 *
 * Each card flies in from its player's side (Reanimated). When a trick is
 * complete it stays for a moment with the winning card glowing ('hold'),
 * then all four cards sweep towards the winner — or into the middle pile
 * after the Rang has been revealed ('sweep').
 */
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { Play, Seat } from '@/game/types';
import { CARD_RATIO } from '@/hooks/useLayout';

import { PlayingCard } from './PlayingCard';

interface Props {
  plays: Play[];
  /** Side length of the (square) trick area in px. */
  size: number;
  cardWidth: number;
  stage: 'live' | 'hold' | 'sweep';
  /** Seat whose card is winning a finished trick (gets the glow). */
  winner: Seat | null;
  /** Where the cards fly when swept: a seat, or the middle pile. */
  sweepTo: Seat | 'pile' | null;
}

/** Unit direction from the centre towards each seat: South, West, North, East. */
const DIRECTION: Record<Seat, { x: number; y: number }> = {
  0: { x: 0, y: 1 },
  1: { x: -1, y: 0 },
  2: { x: 0, y: -1 },
  3: { x: 1, y: 0 },
};
/** A slight, fixed tilt per seat so the trick looks hand-placed. */
const TILT: Record<Seat, number> = { 0: -3, 1: 7, 2: 2, 3: -6 };

/** Where the middle pile sits relative to the trick-area centre (top-right corner). */
export const PILE_OFFSET = { x: 0.62, y: -0.62 };

function TrickCard({
  play,
  size,
  cardWidth,
  sweep,
  sweepTo,
  glowing,
}: {
  play: Play;
  size: number;
  cardWidth: number;
  sweep: SharedValue<number>;
  sweepTo: Seat | 'pile' | null;
  glowing: boolean;
}) {
  const cardHeight = cardWidth * CARD_RATIO;
  const dir = DIRECTION[play.seat];
  // Resting position (offset from centre) and starting position (off-table, at the player's side).
  const rest = { x: dir.x * cardWidth * 0.78, y: dir.y * cardHeight * 0.4 };
  const start = { x: dir.x * size * 0.95, y: dir.y * size * 0.95 };
  const target =
    sweepTo === 'pile'
      ? { x: PILE_OFFSET.x * size * 0.5, y: PILE_OFFSET.y * size * 0.5 }
      : sweepTo !== null
        ? { x: DIRECTION[sweepTo].x * size * 0.9, y: DIRECTION[sweepTo].y * size * 0.9 }
        : rest;

  const fly = useSharedValue(0);
  useEffect(() => {
    fly.set(withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }));
  }, [fly]);

  const style = useAnimatedStyle(() => {
    const x = start.x + (rest.x - start.x) * fly.value;
    const y = start.y + (rest.y - start.y) * fly.value;
    const s = sweep.value;
    return {
      opacity: (0.2 + 0.8 * fly.value) * (1 - s * 0.9),
      transform: [
        { translateX: x + (target.x - x) * s },
        { translateY: y + (target.y - y) * s },
        { rotate: `${TILT[play.seat] * fly.value + (1 - fly.value) * dir.x * 25}deg` },
        { scale: (0.75 + 0.25 * fly.value) * (1 - s * 0.55) },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.card,
        { left: size / 2 - cardWidth / 2, top: size / 2 - cardHeight / 2, zIndex: glowing ? 5 : 1 },
        style,
      ]}>
      <PlayingCard card={play.card} width={cardWidth} highlighted={glowing} />
    </Animated.View>
  );
}

function TrickAreaBase({ plays, size, cardWidth, stage, winner, sweepTo }: Props) {
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.set(stage === 'sweep' ? withTiming(1, { duration: 400, easing: Easing.in(Easing.cubic) }) : 0);
  }, [stage, sweep]);

  return (
    <View style={{ width: size, height: size }} pointerEvents="none" accessibilityLabel="Cards played in this trick">
      {plays.map((play) => (
        <TrickCard
          key={play.card.id}
          play={play}
          size={size}
          cardWidth={cardWidth}
          sweep={sweep}
          sweepTo={sweepTo}
          glowing={stage !== 'live' && play.seat === winner}
        />
      ))}
    </View>
  );
}

export const TrickArea = memo(TrickAreaBase);

const styles = StyleSheet.create({
  card: { position: 'absolute' },
});
