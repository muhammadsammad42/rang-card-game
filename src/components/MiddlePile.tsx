/**
 * MiddlePile.tsx — the stack of post-reveal tricks waiting in the middle of
 * the table, with a count badge. A LottieFiles sparkle plays whenever a
 * player's streak collects the pile.
 */
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { CARD_RATIO } from '@/hooks/useLayout';
import { useMotion } from '@/hooks/useMotion';
import { colors, radii, typography } from '@/theme/theme';

import { LottieAnim } from './LottieAnim';
import { CardBack } from './PlayingCard';

interface Props {
  count: number;
  cardWidth: number;
  /** Increments whenever a pile is collected (triggers the sparkle). */
  collectSeq: number;
  visible: boolean;
}

function MiddlePileBase({ count, cardWidth, collectSeq, visible }: Props) {
  /** The collection whose sparkle has finished. Starts at the current value so remounting never replays it. */
  const [sparkleDone, setSparkleDone] = useState(collectSeq);
  const { reduced } = useMotion();
  const showSparkle = !reduced && collectSeq > 0 && collectSeq !== sparkleDone;
  const bump = useSharedValue(1);

  // A small bounce each time the pile grows.
  useEffect(() => {
    if (count > 0 && !reduced) bump.set(withSequence(withTiming(1.15, { duration: 120 }), withSpring(1)));
  }, [count, bump, reduced]);
  const bumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  if (!visible) return null;
  const w = cardWidth * 0.62;
  const h = w * CARD_RATIO;
  const layers = Math.min(count, 4);

  return (
    <View
      style={{ width: w + 14, height: h + 14, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityLabel={`Middle pile: ${count} trick${count === 1 ? '' : 's'}`}>
      <Animated.View style={[{ width: w, height: h }, bumpStyle]}>
        {count === 0 ? (
          <View style={[styles.empty, { width: w, height: h, borderRadius: w * 0.1 }]}>
            <Text style={[typography.micro, { color: colors.textDim, fontSize: 9 }]}>Pile</Text>
          </View>
        ) : (
          Array.from({ length: layers }).map((_, i) => (
            <View
              key={i}
              style={{ position: 'absolute', width: w, height: h, left: i * 2, top: -i * 2, transform: [{ rotate: `${(i - 1) * 4}deg` }] }}>
              <CardBack width={w} />
            </View>
          ))
        )}
      </Animated.View>
      {count > 0 && (
        <View style={styles.badge}>
          <Text style={[typography.label, { color: colors.textOnGold }]}>{count}</Text>
        </View>
      )}
      {showSparkle && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sparkleWrap]}>
          <LottieAnim
            key={collectSeq}
            name="sparkle"
            loop={false}
            speed={1.6}
            style={{ width: w * 3.2, height: w * 3.2 }}
            onFinish={() => setSparkleDone(collectSeq)}
          />
        </View>
      )}
    </View>
  );
}

export const MiddlePile = memo(MiddlePileBase);

const styles = StyleSheet.create({
  empty: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleWrap: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
});
