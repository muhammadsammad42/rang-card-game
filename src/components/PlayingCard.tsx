/**
 * PlayingCard.tsx — a playing card drawn entirely with Views, Text and SVG.
 *
 * Face: ivory gradient, rank + suit in two corners, and a centre design
 * (a large pip for number cards and Aces, a framed monogram for J/Q/K).
 * Back: navy with a brass frame, diagonal lattice and a diamond emblem.
 * Size is driven by the `width` prop so it scales on every screen.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { memo, ReactElement } from 'react';
import { Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { cardName, isRedSuit, rankLabel } from '@/game/deck';
import type { Card } from '@/game/types';
import { CARD_RATIO } from '@/hooks/useLayout';
import { colors } from '@/theme/theme';

import { SuitIcon } from './SuitIcon';

interface Props {
  card?: Card | null;
  width: number;
  faceDown?: boolean;
  /** Darkened (e.g. not a legal play). */
  dimmed?: boolean;
  /** Gold glow (e.g. selected card). */
  highlighted?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

function CardFace({ card, width }: { card: Card; width: number }) {
  const height = width * CARD_RATIO;
  const ink = isRedSuit(card.suit) ? colors.suitRed : colors.suitBlack;
  const label = rankLabel(card.rank);
  const isCourt = card.rank >= 11 && card.rank <= 13;
  const cornerFont = width * (label.length > 1 ? 0.23 : 0.27);

  const corner = (
    <View style={styles.corner}>
      <Text
        allowFontScaling={false}
        style={[styles.rank, { color: ink, fontSize: cornerFont, lineHeight: cornerFont * 1.08 }]}>
        {label}
      </Text>
      <SuitIcon suit={card.suit} size={width * 0.16} />
    </View>
  );

  return (
    <LinearGradient
      colors={[colors.cardFace, colors.cardFaceShade]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.fill, { borderRadius: width * 0.1 }]}>
      <View style={{ position: 'absolute', left: width * 0.06, top: width * 0.04 }}>{corner}</View>
      <View
        style={{ position: 'absolute', right: width * 0.06, bottom: width * 0.04, transform: [{ rotate: '180deg' }] }}>
        {corner}
      </View>
      <View style={styles.center} pointerEvents="none">
        {isCourt ? (
          <View
            style={[
              styles.courtFrame,
              { width: width * 0.46, height: height * 0.46, borderRadius: width * 0.06 },
            ]}>
            <Text allowFontScaling={false} style={[styles.courtLetter, { color: ink, fontSize: width * 0.32 }]}>
              {label}
            </Text>
            <SuitIcon suit={card.suit} size={width * 0.15} />
          </View>
        ) : (
          <SuitIcon suit={card.suit} size={width * (card.rank === 14 ? 0.5 : 0.36)} />
        )}
      </View>
    </LinearGradient>
  );
}

/** The card back: a brass frame and lattice over midnight navy (also used by the deal animation). */
export function CardBack({ width }: { width: number }) {
  const height = width * CARD_RATIO;
  const inset = width * 0.08;
  const innerW = width - inset * 2;
  const innerH = height - inset * 2;
  const step = innerW / 3;
  const lines: ReactElement[] = [];
  for (let i = -5; i <= 4; i++) {
    const x = i * step;
    lines.push(<Line key={`a${i}`} x1={x} y1={0} x2={x + innerH} y2={innerH} stroke={colors.goldDeep} strokeWidth={0.8} opacity={0.6} />);
    lines.push(<Line key={`b${i}`} x1={x + innerH} y1={0} x2={x} y2={innerH} stroke={colors.goldDeep} strokeWidth={0.8} opacity={0.6} />);
  }
  return (
    <View style={[styles.fill, styles.back, { borderRadius: width * 0.1 }]}>
      <View
        style={{
          position: 'absolute',
          left: inset,
          top: inset,
          width: innerW,
          height: innerH,
          overflow: 'hidden',
          borderRadius: width * 0.05,
        }}>
        <Svg width={innerW} height={innerH}>
          <Rect x={0} y={0} width={innerW} height={innerH} fill={colors.cardBack} />
          {lines}
          <Rect
            x={1}
            y={1}
            width={innerW - 2}
            height={innerH - 2}
            fill="none"
            stroke={colors.gold}
            strokeWidth={1.4}
            rx={width * 0.04}
          />
        </Svg>
      </View>
      <View style={[styles.emblem, { width: width * 0.34, height: width * 0.34, borderRadius: width * 0.05 }]}>
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: SERIF,
            color: colors.goldLight,
            fontSize: width * 0.2,
            fontWeight: '700',
            transform: [{ rotate: '-45deg' }],
          }}>
          R
        </Text>
      </View>
    </View>
  );
}

function PlayingCardBase({ card, width, faceDown, dimmed, highlighted, style }: Props) {
  const height = width * CARD_RATIO;
  const face = !faceDown && card ? card : null;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={face ? cardName(face) : 'Face-down card'}
      style={[styles.shadow, { width, height, borderRadius: width * 0.1 }, highlighted && styles.highlight, style]}>
      {face ? <CardFace card={face} width={width} /> : <CardBack width={width} />}
      {dimmed && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, { borderRadius: width * 0.1 }]} />}
    </View>
  );
}

export const PlayingCard = memo(PlayingCardBase);

const styles = StyleSheet.create({
  fill: { flex: 1, borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden' },
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  highlight: {
    shadowColor: colors.gold,
    shadowOpacity: 0.95,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  corner: { alignItems: 'center' },
  rank: { fontWeight: '800', letterSpacing: -0.5 },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  courtFrame: {
    borderWidth: 1.5,
    borderColor: colors.goldDeep,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(217,182,93,0.14)',
  },
  courtLetter: { fontFamily: SERIF, fontWeight: '700', marginBottom: -2 },
  back: { backgroundColor: colors.cardBack, borderColor: colors.goldDeep, alignItems: 'center', justifyContent: 'center' },
  emblem: {
    backgroundColor: colors.night,
    borderWidth: 1.5,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  dim: { backgroundColor: colors.cardDim },
});
