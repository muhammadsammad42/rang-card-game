/**
 * TrickArea.tsx — the centre of the table where the current trick is played.
 *
 * Each card flies in from its player's side (Reanimated). When a trick is
 * complete it stays for a moment with the winning card glowing, popping up
 * and tagged "Winner" ('hold'), then all four cards sweep towards the
 * winner's side of the table — or into the middle pile after the Rang has
 * been revealed ('sweep'). The Table plays a small Lottie sparkle where a
 * trick is collected. Durations drop to 0 with "Reduce animations".
 */
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Play, Seat } from '@/game/types';
import { CARD_RATIO } from '@/hooks/useLayout';
import { useMotion } from '@/hooks/useMotion';
import { colors, radii, typography } from '@/theme/theme';

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
  reduced,
}: {
  play: Play;
  size: number;
  cardWidth: number;
  sweep: SharedValue<number>;
  sweepTo: Seat | 'pile' | null;
  glowing: boolean;
  reduced: boolean;
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

  const fly = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) fly.set(withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly]);

  // The winning card pops up briefly when the trick is complete.
  const win = useSharedValue(0);
  useEffect(() => {
    if (!glowing) {
      win.set(0);
      return;
    }
    win.set(reduced ? 1 : withSequence(withTiming(1.35, { duration: 160 }), withSpring(1, { damping: 10, stiffness: 200 })));
  }, [glowing, reduced, win]);

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
        { scale: (0.75 + 0.25 * fly.value) * (1 - s * 0.55) * (1 + win.value * 0.1) },
      ],
    };
  });
  const tagStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, win.value) * (1 - sweep.value) }));

  return (
    <Animated.View
      style={[
        styles.card,
        { left: size / 2 - cardWidth / 2, top: size / 2 - cardHeight / 2, zIndex: glowing ? 5 : 1 },
        style,
      ]}>
      <PlayingCard card={play.card} width={cardWidth} highlighted={glowing} />
      {glowing && (
        <Animated.View style={[styles.tag, tagStyle]}>
          <Text allowFontScaling={false} style={[typography.micro, { color: colors.textOnGold, fontSize: 9 }]}>
            Winner
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function TrickAreaBase({ plays, size, cardWidth, stage, winner, sweepTo }: Props) {
  const { reduced } = useMotion();
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.set(stage === 'sweep' ? withTiming(1, { duration: reduced ? 0 : 400, easing: Easing.in(Easing.cubic) }) : 0);
  }, [stage, sweep, reduced]);

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
          reduced={reduced}
        />
      ))}
    </View>
  );
}

export const TrickArea = memo(TrickAreaBase);

const styles = StyleSheet.create({
  card: { position: 'absolute' },
  tag: {
    position: 'absolute',
    top: -9,
    alignSelf: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
});
