/**
 * SuitIcon.tsx — the four suit symbols drawn as SVG paths (no fonts/emoji),
 * so they look identical on every device.
 */
import { memo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { isRedSuit } from '@/game/deck';
import type { Suit } from '@/game/types';
import { colors } from '@/theme/theme';

interface Props {
  suit: Suit;
  size: number;
  /** Override the default red/black colour (e.g. gold on dark backgrounds). */
  color?: string;
}

const HEART =
  'M50 90 C22 68 4 50 4 30 C4 15 16 5 30 5 C40 5 47 11 50 19 C53 11 60 5 70 5 C84 5 96 15 96 30 C96 50 78 68 50 90 Z';
const DIAMOND = 'M50 3 L90 50 L50 97 L10 50 Z';
const SPADE =
  'M50 3 C36 24 6 40 6 61 C6 75 17 84 30 84 C38 84 44 80 47 74 C46 84 42 91 34 97 L66 97 C58 91 54 84 53 74 C56 80 62 84 70 84 C83 84 94 75 94 61 C94 40 64 24 50 3 Z';
const CLUB_STEM = 'M46 52 C46 74 42 88 33 97 L67 97 C58 88 54 74 54 52 Z';

function SuitIconBase({ suit, size, color }: Props) {
  const fill = color ?? (isRedSuit(suit) ? colors.suitRed : colors.suitBlack);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {suit === 'H' && <Path d={HEART} fill={fill} />}
      {suit === 'D' && <Path d={DIAMOND} fill={fill} />}
      {suit === 'S' && <Path d={SPADE} fill={fill} />}
      {suit === 'C' && (
        <>
          <Circle cx={50} cy={27} r={21} fill={fill} />
          <Circle cx={27} cy={59} r={21} fill={fill} />
          <Circle cx={73} cy={59} r={21} fill={fill} />
          <Circle cx={50} cy={52} r={12} fill={fill} />
          <Path d={CLUB_STEM} fill={fill} />
        </>
      )}
    </Svg>
  );
}

export const SuitIcon = memo(SuitIconBase);

/** Suit colour that stays readable on the dark table (red suits lightened). */
export const suitColorOnDark = (suit: 'S' | 'H' | 'D' | 'C'): string =>
  isRedSuit(suit) ? '#FF6B78' : colors.ivory;
