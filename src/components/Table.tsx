/**
 * Table.tsx — the felt table: North (partner), West and East seats, the trick
 * area in the middle, the hidden Rang card (top-left), the middle pile
 * (top-right), and the dealing animation. The human (South) sits below the
 * table, represented by the hand and the action bar.
 *
 * All positions are computed from the table's measured size (onLayout), so it
 * adapts to every screen.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import type { PlayerProfile } from '@/game/players';
import { partnerOf } from '@/game/rules';
import type { GameState, Seat as SeatId } from '@/game/types';
import type { GameEvents, ShownTrick } from '@/context/GameProvider';
import { colors, gradients, motion, radii, spacing } from '@/theme/theme';

import { DealOverlay, Point } from './DealOverlay';
import { MiddlePile } from './MiddlePile';
import { RangSlot } from './RangSlot';
import { Seat } from './Seat';
import { TrickArea } from './TrickArea';

interface Props {
  game: GameState;
  players: PlayerProfile[];
  humanSeat: SeatId;
  shownTrick: ShownTrick | null;
  events: GameEvents;
  seatSize: number;
  maxTrickCardWidth: number;
}

/** Latest bid/pass of a seat during bidding, for the speech bubble. */
function bubbleFor(game: GameState, seat: SeatId): string | null {
  if (game.phase !== 'BIDDING' && game.phase !== 'CHOOSE_RANG') return null;
  const call = game.bids.find((b) => b.seat === seat);
  if (!call) return null;
  return call.value === 'pass' ? 'Pass' : String(call.value);
}

export function Table({ game, players, humanSeat, shownTrick, events, seatSize, maxTrickCardWidth }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize({ w: width, h: height });
  };

  const { w, h } = size;
  const seatW = seatSize + 44;
  const seatH = seatSize + 44;
  // The trick area fills the space below North and between West and East.
  const side = Math.max(120, Math.min(w - 2 * (seatW + 4), h - seatH - spacing.lg));
  const trickCardWidth = Math.min(maxTrickCardWidth, side / 2.6);
  const centerY = seatH + (h - seatH) / 2;

  const shown = shownTrick?.record ?? null;
  const plays = shown ? shown.plays : game.currentTrick.plays;
  const stage = shownTrick ? shownTrick.stage : 'live';
  const sweepTo = shown ? (shown.outcome.type === 'pile' ? 'pile' : shown.winner) : null;

  // Seat centres for the deal animation (South = towards the human's hand, below the felt).
  const seatPoints: Point[] = [
    { x: w / 2, y: h + 70 },
    { x: 8 + seatW / 2, y: centerY },
    { x: w / 2, y: 8 + seatSize / 2 },
    { x: w - 8 - seatW / 2, y: centerY },
  ];
  const dealing = game.phase === 'DEAL_5' || game.phase === 'DEAL_REST';

  const seatProps = (seat: SeatId) => ({
    player: players[seat],
    size: seatSize,
    isTurn: game.turn === seat && !dealing && game.phase !== 'HAND_OVER' && !shownTrick,
    isDealer: game.dealer === seat,
    isBidder: game.bidder === seat,
    cardCount: game.hands[seat].length,
    bubble: bubbleFor(game, seat),
  });

  return (
    <View style={styles.rail}>
      <LinearGradient colors={gradients.felt} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.felt} onLayout={onLayout}>
        {/* soft spotlight (SVG radial gradient) + watermark give the felt some depth */}
        {h > 0 && (
          <Svg pointerEvents="none" width={w} height={h} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="spot" cx={w / 2} cy={centerY} rx={w * 0.6} ry={h * 0.42} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={0.1} />
                <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={h} fill="url(#spot)" />
          </Svg>
        )}
        <Text pointerEvents="none" style={[styles.watermark, { top: centerY - 22 }]}>
          RANG
        </Text>

        {w > 0 && (
          <>
            <View style={[styles.abs, { top: 8, left: 0, right: 0, alignItems: 'center' }]}>
              <Seat {...seatProps(partnerOf(humanSeat))} tag="Partner" />
            </View>
            <View style={[styles.abs, { left: 8, top: centerY - seatH / 2 }]}>
              <Seat {...seatProps(1)} />
            </View>
            <View style={[styles.abs, { right: 8, top: centerY - seatH / 2 }]}>
              <Seat {...seatProps(3)} />
            </View>

            <View style={[styles.abs, { left: spacing.md, top: spacing.md }]}>
              <RangSlot
                placed={game.rangCard !== null || game.hiddenCard !== null}
                revealed={game.rangRevealed}
                card={game.rangRevealed || game.bidder === humanSeat ? game.rangCard : null}
                knownSuit={game.rangRevealed || game.bidder === humanSeat ? game.rangSuit : null}
                mine={game.bidder === humanSeat}
                revealSeq={events.revealSeq}
                cardWidth={trickCardWidth}
              />
            </View>
            <View style={[styles.abs, { right: spacing.md, top: spacing.md }]}>
              <MiddlePile count={game.pile} cardWidth={trickCardWidth} collectSeq={events.collectSeq} visible={game.rangRevealed} />
            </View>

            <View style={[styles.abs, { left: (w - side) / 2, top: centerY - side / 2 }]}>
              <TrickArea
                plays={plays}
                size={side}
                cardWidth={trickCardWidth}
                stage={stage}
                winner={shown?.winner ?? null}
                sweepTo={sweepTo}
              />
            </View>
          </>
        )}
      </LinearGradient>

      {w > 0 && dealing && (
        <DealOverlay
          key={`${game.handNumber}-${game.handSeed}-${game.phase}`}
          dealer={game.dealer}
          count={game.phase === 'DEAL_5' ? 20 : 32}
          stagger={game.phase === 'DEAL_5' ? motion.deal : motion.deal * 0.55}
          seatPoints={seatPoints.map((p) => ({ x: p.x + 6, y: p.y + 6 }))}
          cardWidth={trickCardWidth * 0.7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flex: 1,
    marginHorizontal: spacing.sm,
    padding: 6,
    borderRadius: radii.xl + 10,
    backgroundColor: colors.feltEdge,
    borderWidth: 1,
    borderColor: colors.goldDeep,
  },
  felt: { flex: 1, borderRadius: radii.xl + 4, overflow: 'hidden' },
  abs: { position: 'absolute' },
  watermark: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 12,
    color: 'rgba(217,182,93,0.07)',
  },
});
