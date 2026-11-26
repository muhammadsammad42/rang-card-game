/**
 * Hand.tsx — your cards, fanned in an arc at the bottom of the table.
 *
 * Layout: `fanLayout` (utils/handView) always fits all 13 cards inside the
 * screen width and keeps every card's rank + suit corner visible, shrinking
 * the cards on narrow phones instead of cutting them off.
 *
 * Highlighting: each card arrives with a `state` built by `buildHandView`
 * from the engine's legal cards —
 *   'playable' → glowing accent border (gently pulsing), lifted slightly;
 *   'blocked'  → darkened to ≈45 % brightness, lowered, can't be dragged;
 *   'idle'     → not your turn: neutral look, the hand ignores touches.
 * Every visual change is a Reanimated shared value animated on the UI thread,
 * so the 13 React components don't re-render while cards lift, glow or move.
 *
 * Interaction (only while `interactive`, i.e. your turn to play):
 *   - tap a playable card → it lifts and grows (selected); tap again → play;
 *   - drag a playable card → it follows your finger; a glowing drop zone
 *     appears in the centre of the table; release inside it (or flick it
 *     upwards) → play, release elsewhere → it springs back into the fan;
 *   - tap a blocked card → that card shakes, the phone buzzes and the status
 *     bar explains why ("You must follow ♦ Diamonds").
 */
import { memo, useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, {
  AnimatedRef,
  cancelAnimation,
  Easing,
  measure,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { cardName } from '@/game/deck';
import type { Card } from '@/game/types';
import { useMotion } from '@/hooks/useMotion';
import { colors } from '@/theme/theme';
import { cardA11yLabel, fanLayout, HandCardState, HandCardView } from '@/utils/handView';

import { PlayingCard } from './PlayingCard';

/** Drag state shared with the table's drop zone: 0 idle · 1 dragging · 2 over the drop zone. */
export type DragState = SharedValue<number>;

interface Props {
  cards: HandCardView[];
  /** Width available for the fan. */
  width: number;
  /** Largest card width wanted (cards shrink below this if 13 wouldn't fit). */
  maxCardWidth: number;
  /** Your turn to play: gestures are on. Otherwise the hand is visible but inert. */
  interactive: boolean;
  selectedId: string | null;
  onTap: (card: Card) => void;
  /** Play the card (drag-drop / flick). Returns false if it was refused (the card then springs back). */
  onPlay: (card: Card) => boolean;
  onBlocked: (card: Card) => void;
  /** Animated ref of the table's centre drop zone (measured on the UI thread while dragging). */
  dropZone: AnimatedRef<View>;
  dragState: DragState;
  /** Changes after a refused move → the whole hand shakes. */
  shakeSeq: number;
  /** Delay between this player's dealt cards, and before the first one (ms). */
  dealStagger: number;
  dealOffset: number;
}

interface CardProps {
  card: Card;
  state: HandCardState;
  x: number;
  y: number;
  rotate: number;
  cardWidth: number;
  selected: boolean;
  interactive: boolean;
  enterDelay: number;
  zIndex: number;
  pulse: SharedValue<number>;
  dropZone: AnimatedRef<View>;
  dragState: DragState;
  reduced: boolean;
  onTap: (card: Card) => void;
  onPlay: (card: Card) => boolean;
  onBlocked: (card: Card) => void;
}

const MODE = { idle: 0, playable: 1, blocked: 2 } as const;

const HandCard = memo(function HandCard({
  card,
  state,
  x,
  y,
  rotate,
  cardWidth,
  selected,
  interactive,
  enterDelay,
  zIndex,
  pulse,
  dropZone,
  dragState,
  reduced,
  onTap,
  onPlay,
  onBlocked,
}: CardProps) {
  const cardHeight = cardWidth * 1.4;
  const radius = cardWidth * 0.1;
  const ms = (d: number) => (reduced ? 0 : d);

  const posX = useSharedValue(x);
  const posY = useSharedValue(y);
  const rot = useSharedValue(rotate);
  const enter = useSharedValue(reduced ? 1 : 0);
  const lift = useSharedValue(0);
  const grow = useSharedValue(0);
  const glow = useSharedValue(0);
  const dim = useSharedValue(0);
  const shake = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragging = useSharedValue(0);
  const gone = useSharedValue(0);
  /** Current state as a number, readable from gesture worklets. */
  const mode = useSharedValue<number>(MODE[state]);

  // Deal-in: drop from above with a stagger (once, when the card mounts).
  useEffect(() => {
    if (reduced) return;
    enter.set(withDelay(enterDelay, withTiming(1, { duration: 380, easing: Easing.out(Easing.back(1.2)) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slide smoothly when the fan layout changes (cards added/removed/re-sorted).
  useEffect(() => {
    const d = ms(260);
    posX.set(withTiming(x, { duration: d }));
    posY.set(withTiming(y, { duration: d }));
    rot.set(withTiming(rotate, { duration: d }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, rotate, posX, posY, rot, reduced]);

  // State → lift / glow / dim targets.
  useEffect(() => {
    mode.set(MODE[state]);
    const liftTo = selected ? -cardHeight * 0.24 : state === 'playable' ? -cardHeight * 0.07 : state === 'blocked' ? cardHeight * 0.05 : 0;
    lift.set(reduced ? liftTo : withSpring(liftTo, { damping: 15, stiffness: 240 }));
    grow.set(withTiming(selected ? 1 : 0, { duration: ms(180) }));
    glow.set(withTiming(state === 'playable' ? 1 : 0, { duration: ms(200) }));
    dim.set(withTiming(state === 'blocked' ? 1 : 0, { duration: ms(200) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, selected, cardHeight, reduced]);

  /** Runs on the JS thread after a drop: play, or spring back if the move was refused. */
  const drop = useCallback(
    (c: Card) => {
      if (!onPlay(c)) {
        gone.set(0);
        dragX.set(withSpring(0));
        dragY.set(withSpring(0));
      }
    },
    [onPlay, gone, dragX, dragY],
  );

  const tap = useTapGesture({
    enabled: interactive,
    onActivate: () => {
      'worklet';
      if (mode.value === MODE.blocked) {
        shake.set(
          withSequence(
            withTiming(-9, { duration: 45 }),
            withTiming(9, { duration: 70 }),
            withTiming(-6, { duration: 60 }),
            withTiming(4, { duration: 55 }),
            withTiming(0, { duration: 45 }),
          ),
        );
        scheduleOnRN(onBlocked, card);
      } else {
        scheduleOnRN(onTap, card);
      }
    },
  });

  const pan = usePanGesture({
    enabled: interactive && state === 'playable',
    minDistance: 10,
    onActivate: () => {
      'worklet';
      dragging.set(withTiming(1, { duration: 120 }));
      dragState.set(1);
    },
    onUpdate: (e) => {
      'worklet';
      dragX.set(e.translationX);
      dragY.set(e.translationY);
      const zone = measure(dropZone);
      const slack = 24;
      const over =
        zone !== null &&
        e.absoluteX > zone.pageX - slack &&
        e.absoluteX < zone.pageX + zone.width + slack &&
        e.absoluteY > zone.pageY - slack &&
        e.absoluteY < zone.pageY + zone.height + slack;
      dragState.set(over ? 2 : 1);
    },
    onDeactivate: (e) => {
      'worklet';
      // Released over the drop zone, or flicked firmly towards the centre → play.
      const flick = e.velocityY < -900 && e.translationY < -cardHeight * 0.35;
      if (dragState.value === 2 || flick) {
        gone.set(withTiming(1, { duration: 140 }));
        scheduleOnRN(drop, card);
      } else {
        dragX.set(withSpring(0, { damping: 14, stiffness: 180 }));
        dragY.set(withSpring(0, { damping: 14, stiffness: 180 }));
      }
    },
    onFinalize: () => {
      'worklet';
      dragState.set(0);
      dragging.set(withTiming(0, { duration: 160 }));
      if (gone.value === 0) {
        dragX.set(withSpring(0, { damping: 14, stiffness: 180 }));
        dragY.set(withSpring(0, { damping: 14, stiffness: 180 }));
      }
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value * (1 - gone.value),
    zIndex: dragging.value > 0 ? 100 : zIndex,
    transform: [
      { translateX: posX.value + dragX.value + shake.value },
      { translateY: posY.value + lift.value + dragY.value - (1 - enter.value) * cardHeight * 1.4 },
      { rotate: `${rot.value * (1 - dragging.value)}deg` },
      { scale: 1 + grow.value * 0.08 + dragging.value * 0.1 },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: glow.value * (0.35 + pulse.value * 0.4) }));
  const borderStyle = useAnimatedStyle(() => ({ opacity: Math.max(glow.value * (0.7 + pulse.value * 0.3), grow.value) }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

  const activate = () => {
    if (!interactive) return;
    if (state === 'blocked') onBlocked(card);
    else onTap(card);
  };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="button"
        accessibilityLabel={cardA11yLabel(cardName(card), state, selected)}
        accessibilityHint={state === 'playable' ? 'Tap to select, tap again or drag to the centre to play' : undefined}
        accessibilityState={{ disabled: !interactive || state === 'blocked', selected }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={activate}
        style={[styles.card, { width: cardWidth, height: cardHeight }, style]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, { borderRadius: radius + 5, left: -5, top: -5, right: -5, bottom: -5 }, haloStyle]}
        />
        {/* Wrapped so the card's Android `elevation` stays inside this View: otherwise the
            elevated card would be drawn above the dim / glow overlays below. */}
        <View>
          <PlayingCard card={card} width={cardWidth} />
        </View>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, { borderRadius: radius }, dimStyle]} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.border, { borderRadius: radius }, borderStyle]} />
      </Animated.View>
    </GestureDetector>
  );
});

function HandBase({
  cards,
  width,
  maxCardWidth,
  interactive,
  selectedId,
  onTap,
  onPlay,
  onBlocked,
  dropZone,
  dragState,
  shakeSeq,
  dealStagger,
  dealOffset,
}: Props) {
  const { reduced } = useMotion();
  const layout = fanLayout(cards.length, width, maxCardWidth);

  // One shared "breathing" value drives the glow of every playable card.
  const pulse = useSharedValue(0);
  const anyPlayable = cards.some((c) => c.state === 'playable');
  useEffect(() => {
    if (anyPlayable && !reduced) {
      pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
    } else {
      cancelAnimation(pulse);
      pulse.set(reduced && anyPlayable ? 1 : 0);
    }
  }, [anyPlayable, reduced, pulse]);

  // A refused move → shake the whole hand.
  const shake = useSharedValue(0);
  useEffect(() => {
    if (shakeSeq === 0) return;
    shake.set(
      withSequence(
        withTiming(-10, { duration: 50 }),
        withTiming(10, { duration: 70 }),
        withTiming(-7, { duration: 60 }),
        withTiming(5, { duration: 60 }),
        withTiming(0, { duration: 50 }),
      ),
    );
  }, [shakeSeq, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <Animated.View
      style={[{ width, height: layout.height }, shakeStyle]}
      accessibilityLabel={`Your hand, ${cards.length} cards${interactive ? `, ${cards.filter((c) => c.isPlayable).length} playable` : ''}`}>
      <View style={StyleSheet.absoluteFill}>
        {cards.map(({ card, state }, i) => {
          const slot = layout.slots[i];
          return (
            <HandCard
              key={card.id}
              card={card}
              state={state}
              x={slot.x}
              y={slot.y}
              rotate={slot.rotate}
              cardWidth={layout.cardWidth}
              selected={card.id === selectedId}
              interactive={interactive}
              enterDelay={dealOffset + i * dealStagger}
              zIndex={card.id === selectedId ? 50 : i}
              pulse={pulse}
              dropZone={dropZone}
              dragState={dragState}
              reduced={reduced}
              onTap={onTap}
              onPlay={onPlay}
              onBlocked={onBlocked}
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
  halo: { position: 'absolute', backgroundColor: colors.accentGlow },
  dim: { backgroundColor: colors.cardDim },
  border: { borderWidth: 2.5, borderColor: colors.accent },
});
