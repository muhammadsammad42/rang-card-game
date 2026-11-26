/**
 * Hand.tsx — the human player's cards, fanned in an arc at the bottom.
 *
 * Interaction: tap a card to select it (it lifts), tap it again — or swipe it
 * upwards — to play it. Legal cards are highlighted on your turn and illegal
 * ones are dimmed. Animations (Reanimated): cards are dealt in with a stagger,
 * slide to new positions when the hand re-sorts, lift when selected, follow
 * your finger when dragged, and the whole hand shakes after an invalid move.
 */
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { cardName } from '@/game/deck';
import type { Card } from '@/game/types';
import { CARD_RATIO } from '@/hooks/useLayout';

import { PlayingCard } from './PlayingCard';

interface Props {
  cards: Card[];
  /** Width available for the fan. */
  width: number;
  cardWidth: number;
  legalIds: Set<string>;
  /** Highlight legal / dim illegal cards (only when it's your turn to play). */
  showLegality: boolean;
  selectedId: string | null;
  onTap: (card: Card) => void;
  onSwipe: (card: Card) => void;
  /** Changes after an invalid move → the hand shakes. */
  shakeSeq: number;
  /** Delay between this player's dealt cards, and before the first one (ms). */
  dealStagger: number;
  dealOffset: number;
}

interface CardProps {
  card: Card;
  x: number;
  y: number;
  rotate: number;
  cardWidth: number;
  selected: boolean;
  dimmed: boolean;
  highlighted: boolean;
  enterDelay: number;
  zIndex: number;
  onTap: (card: Card) => void;
  onSwipe: (card: Card) => void;
}

const HandCard = memo(function HandCard({
  card,
  x,
  y,
  rotate,
  cardWidth,
  selected,
  dimmed,
  highlighted,
  enterDelay,
  zIndex,
  onTap,
  onSwipe,
}: CardProps) {
  const cardHeight = cardWidth * CARD_RATIO;
  const posX = useSharedValue(x);
  const posY = useSharedValue(y);
  const rot = useSharedValue(rotate);
  const lift = useSharedValue(0);
  const drag = useSharedValue(0);
  const enter = useSharedValue(0);

  // Deal-in: drop from above with a stagger.
  useEffect(() => {
    enter.set(withDelay(enterDelay, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.2)) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slide smoothly when the fan layout changes (cards added/removed/sorted).
  useEffect(() => {
    posX.set(withTiming(x, { duration: 260 }));
    posY.set(withTiming(y, { duration: 260 }));
    rot.set(withTiming(rotate, { duration: 260 }));
  }, [x, y, rotate, posX, posY, rot]);

  // Lift the selected card.
  useEffect(() => {
    lift.set(withSpring(selected ? -cardHeight * 0.22 : 0, { damping: 14, stiffness: 220 }));
  }, [selected, cardHeight, lift]);

  // Gesture callbacks are worklets: they run on the UI thread (smooth dragging)
  // and hop back to the JS thread with scheduleOnRN to call onTap/onSwipe.
  const swipeDistance = cardHeight * 0.45;
  const pan = usePanGesture({
    activeOffsetY: -12, // only an upward drag activates the swipe
    failOffsetX: [-24, 24],
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.min(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY < -swipeDistance) scheduleOnRN(onSwipe, card);
      drag.set(withSpring(0));
    },
    onFinalize: () => {
      'worklet';
      drag.set(withSpring(0));
    },
  });
  const tap = useTapGesture({
    onActivate: () => {
      'worklet';
      scheduleOnRN(onTap, card);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateX: posX.value },
      { translateY: posY.value + lift.value + drag.value - (1 - enter.value) * cardHeight * 1.4 },
      { rotate: `${rot.value}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${cardName(card)}${dimmed ? ', not playable now' : ''}${selected ? ', selected' : ''}`}
        accessibilityHint="Tap to select, tap again or swipe up to play"
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => onTap(card)}
        style={[styles.card, { width: cardWidth, height: cardHeight, zIndex }, style]}>
        <PlayingCard card={card} width={cardWidth} dimmed={dimmed} highlighted={selected || highlighted} />
      </Animated.View>
    </GestureDetector>
  );
});

function HandBase({
  cards,
  width,
  cardWidth,
  legalIds,
  showLegality,
  selectedId,
  onTap,
  onSwipe,
  shakeSeq,
  dealStagger,
  dealOffset,
}: Props) {
  const cardHeight = cardWidth * CARD_RATIO;
  const n = cards.length;

  // Fan geometry: overlap cards so they fit the width, rotate them along a gentle arc.
  const pad = 8;
  const maxSpread = Math.max(0, width - cardWidth - pad * 2);
  const step = n > 1 ? Math.min(cardWidth * 0.62, maxSpread / (n - 1)) : 0;
  const total = cardWidth + step * (n - 1);
  const left0 = (width - total) / 2;
  const maxRot = Math.min(16, n * 1.3);
  const arc = cardWidth * 0.16;

  // Deal-in delay: each card's delay grows with its position in the fan. It only
  // matters when a card mounts — i.e. when it is dealt — so cards already in the
  // hand are unaffected, and newly dealt cards drop in left to right.

  // Invalid move → shake the whole hand.
  const shake = useSharedValue(0);
  useEffect(() => {
    if (shakeSeq === 0) return;
    shake.set(withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 70 }),
      withTiming(-7, { duration: 60 }),
      withTiming(5, { duration: 60 }),
      withTiming(0, { duration: 50 }),
    ));
  }, [shakeSeq, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <Animated.View style={[{ width, height: cardHeight * 1.42 }, shakeStyle]}>
      <View style={StyleSheet.absoluteFill}>
        {cards.map((card, i) => {
          const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0; // -1 … 1 across the fan
          const legal = legalIds.has(card.id);
          return (
            <HandCard
              key={card.id}
              card={card}
              x={left0 + i * step}
              y={cardHeight * 0.22 + t * t * arc}
              rotate={t * maxRot}
              cardWidth={cardWidth}
              selected={card.id === selectedId}
              dimmed={showLegality && !legal}
              highlighted={showLegality && legal && n > 0 && legalIds.size < n}
              enterDelay={dealOffset + i * dealStagger}
              zIndex={i}
              onTap={onTap}
              onSwipe={onSwipe}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

export const Hand = memo(HandBase);

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 0, top: 0 },
});
