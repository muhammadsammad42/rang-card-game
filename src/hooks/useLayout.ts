/**
 * useLayout.ts — responsive sizing derived from the window size.
 *
 * No hard-coded screen sizes: card, seat and font sizes scale with the
 * available width/height so the table fits small phones and tablets alike.
 */
import { useWindowDimensions } from 'react-native';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Cards are drawn at this height/width ratio (close to a real 63×88 mm card). */
export const CARD_RATIO = 1.4;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  /** Content never stretches wider than this on tablets. */
  const contentWidth = Math.min(width, isTablet ? 760 : width);
  const compact = height < 700;
  const handCardWidth = clamp(contentWidth * 0.19, 54, isTablet ? 104 : 86);
  const trickCardWidth = clamp(Math.min(contentWidth, height * 0.55) * 0.17, 46, isTablet ? 92 : 74);
  const seatSize = clamp(contentWidth * 0.12, 40, isTablet ? 64 : 52);
  return { width, height, isTablet, compact, contentWidth, handCardWidth, trickCardWidth, seatSize };
}
