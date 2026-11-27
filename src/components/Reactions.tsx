/**
 * Reactions.tsx — emoji reactions on the table (no text chat, no input).
 *
 *  - <ReactionLayer>: one floating emoji per active reaction, drawn above the
 *    sender's seat. Reanimated: pops in, drifts up and fades out (~2.5 s).
 *  - <ReactionButton>: a small round button; tap → a compact tray with the 10
 *    allowed emojis; picking one sends it and closes the tray.
 */
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import type { ReactionBubble } from '@/hooks/useReactions';
import { useMotion } from '@/hooks/useMotion';
import { colors, radii, spacing } from '@/theme/theme';
import { REACTION_EMOJIS, REACTION_SHOW_MS, type ReactionEmoji } from '@/utils/reactions';

import type { Point } from './DealOverlay';

const SIZE = 46;

const Float = memo(function Float({ emoji, at }: { emoji: string; at: Point }) {
  const { reduced } = useMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: REACTION_SHOW_MS, easing: Easing.out(Easing.quad) }));
  }, [t]);
  const pop = useSharedValue(reduced ? 1 : 0.3);
  useEffect(() => {
    if (!reduced) pop.set(withSequence(withTiming(1.25, { duration: 180 }), withTiming(1, { duration: 160 })));
  }, [pop, reduced]);
  const fade = useSharedValue(1);
  useEffect(() => {
    fade.set(withDelay(REACTION_SHOW_MS - 600, withTiming(0, { duration: 550 })));
  }, [fade]);

  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: reduced ? 0 : -t.value * 56 }, { scale: pop.value }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.float, { left: at.x - SIZE / 2, top: at.y - SIZE / 2 }, style]}>
      <Text style={styles.floatEmoji} allowFontScaling={false}>
        {emoji}
      </Text>
    </Animated.View>
  );
});

/** `points[seat]` = where that seat's reaction starts (view seats, 0 = me). */
export function ReactionLayer({ bubbles, points }: { bubbles: ReactionBubble[]; points: Point[] }) {
  return (
    <>
      {bubbles.map((b) => (
        <Float key={b.id} emoji={b.emoji} at={points[b.seat]} />
      ))}
    </>
  );
}

export function ReactionButton({ onSend }: { onSend: (emoji: ReactionEmoji) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.anchor}>
      {open && (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={styles.tray}>
          {REACTION_EMOJIS.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`Send reaction ${e}`}
              hitSlop={2}
              onPress={() => {
                onSend(e);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Text style={styles.optionEmoji} allowFontScaling={false}>
                {e}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close reactions' : 'Open reactions'}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [styles.button, open && styles.buttonOpen, pressed && styles.optionPressed]}
      >
        <Text style={styles.buttonEmoji} allowFontScaling={false}>
          {open ? '✕' : '😀'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  float: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  floatEmoji: { fontSize: 26 },
  anchor: { position: 'absolute', left: spacing.sm, bottom: spacing.sm, alignItems: 'flex-start' },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  buttonOpen: { borderColor: colors.accent },
  buttonEmoji: { fontSize: 18, color: colors.accent },
  tray: {
    width: 5 * 40 + 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    marginBottom: 6,
    borderRadius: radii.lg,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  option: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  optionPressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
  optionEmoji: { fontSize: 24 },
});
