/**
 * game.tsx — the Game Table screen.
 *
 * Layout (top → bottom): TopBar (pause, score, last-trick peek), InfoStrip
 * (bid, Rang status, tricks), the felt Table, the ActionBar (status, streak,
 * Reveal Rang) and your Hand. Phase-specific overlays sit on top: Bidding,
 * Choose Rang, Result, Pause menu and Last-trick peek.
 *
 * Flow of a card play: tap/swipe in <Hand> → onTap/onSwipe here →
 * GameProvider.playCard (validates) → engine reducer → new state → re-render
 * → TrickArea animates the card flying in.
 */
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionBar } from '@/components/ActionBar';
import { BiddingPanel } from '@/components/BiddingPanel';
import { Hand } from '@/components/Hand';
import { LastTrickModal } from '@/components/LastTrickModal';
import { PauseMenu } from '@/components/PauseMenu';
import { RangPicker } from '@/components/RangPicker';
import { ResultModal } from '@/components/ResultModal';
import { InfoStrip, TopBar } from '@/components/ScoreBoard';
import { Table } from '@/components/Table';
import { useGame } from '@/context/GameProvider';
import { sortHand } from '@/game/deck';
import type { Card } from '@/game/types';
import { useFeedback } from '@/hooks/useFeedback';
import { useLayout } from '@/hooks/useLayout';
import { gradients, motion, spacing } from '@/theme/theme';
import { statusLine, streakLine } from '@/utils/status';

export default function GameScreen() {
  const g = useGame();
  const { game, players, humanSeat } = g;
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const feedback = useFeedback();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [peek, setPeek] = useState(false);

  const { setActive, pause, startNewMatch } = g;

  // Bots only run while this screen is focused; leaving it pauses the table.
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, [setActive]),
  );

  // Android back button opens the pause menu instead of leaving mid-hand.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        pause();
        return true;
      });
      return () => sub.remove();
    }, [pause]),
  );

  // Opened without a match (e.g. via a deep link)? Start one.
  useEffect(() => {
    if (!game) startNewMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hand = useMemo(() => (game ? sortHand(game.hands[humanSeat]) : []), [game, humanSeat]);

  // Forget the selection when the selected card leaves the hand or a new hand starts.
  useEffect(() => {
    if (selectedId && !hand.some((c) => c.id === selectedId)) setSelectedId(null);
  }, [hand, selectedId]);

  const playing = game?.phase === 'PLAYING';
  const myPlayTurn = playing && g.isHumanTurn && !g.shownTrick;

  const onTap = useCallback(
    (card: Card) => {
      // On your turn, tapping an illegal card explains why (message + shake).
      if (myPlayTurn && !g.legalIds.has(card.id)) {
        g.playCard(card.id);
        return;
      }
      if (selectedId === card.id) {
        if (g.playCard(card.id)) setSelectedId(null);
      } else {
        setSelectedId(card.id);
        feedback.tap();
      }
    },
    [g, myPlayTurn, selectedId, feedback],
  );

  const onSwipe = useCallback(
    (card: Card) => {
      if (g.playCard(card.id)) setSelectedId(null);
    },
    [g],
  );

  const goHome = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  if (!game) return <LinearGradient colors={gradients.room} style={styles.screen} />;

  const shown = g.shownTrick?.record ?? null;
  const status = statusLine(game, players, humanSeat, shown, g.canReveal);
  const streak = streakLine(game, players, humanSeat);
  const handWidth = layout.contentWidth - spacing.md * 2;

  // Deal-in timing for the human's cards (they get every 4th card of the deal).
  const position = (humanSeat - game.dealer + 4) % 4; // 1 = first to receive
  const perCard = game.phase === 'DEAL_REST' ? motion.deal * 0.55 : motion.deal;
  const dealOffset = (((position + 3) % 4) * perCard) as number;

  return (
    <LinearGradient colors={gradients.room} style={styles.screen}>
      <View style={[styles.column, { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xs, width: layout.contentWidth }]}>
        <TopBar game={game} onPause={pause} onPeek={() => setPeek(true)} />
        <View style={{ height: spacing.sm }} />
        <InfoStrip game={game} players={players} humanSeat={humanSeat} />
        <View style={{ height: spacing.sm }} />
        <Table
          game={game}
          players={players}
          humanSeat={humanSeat}
          shownTrick={g.shownTrick}
          events={g.events}
          seatSize={layout.seatSize}
          maxTrickCardWidth={layout.trickCardWidth}
        />
        <ActionBar
          game={game}
          me={players[humanSeat]}
          humanSeat={humanSeat}
          isMyTurn={g.isHumanTurn && !g.shownTrick && game.phase !== 'DEAL_5' && game.phase !== 'DEAL_REST'}
          status={status}
          streak={streak}
          error={g.error}
          canReveal={g.canReveal && !g.paused}
          onReveal={g.reveal}
        />
        <View style={styles.handWrap}>
          <Hand
            cards={hand}
            width={handWidth}
            cardWidth={layout.handCardWidth}
            legalIds={g.legalIds}
            showLegality={!!myPlayTurn}
            selectedId={selectedId}
            onTap={onTap}
            onSwipe={onSwipe}
            shakeSeq={g.error?.seq ?? 0}
            dealStagger={perCard * 4}
            dealOffset={dealOffset}
          />
        </View>
      </View>

      {game.phase === 'BIDDING' && (
        <BiddingPanel
          game={game}
          players={players}
          humanSeat={humanSeat}
          isHumanTurn={g.isHumanTurn && !g.paused}
          cardWidth={Math.min(64, layout.handCardWidth * 0.85)}
          onBid={g.bid}
          onPass={g.pass}
        />
      )}

      {game.phase === 'CHOOSE_RANG' && game.bidder === humanSeat && !g.paused && (
        <RangPicker
          cards={game.hands[humanSeat]}
          bid={game.bid ?? 8}
          forced={game.forcedBid}
          cardWidth={Math.min(66, layout.handCardWidth * 0.85)}
          onConfirm={g.chooseRang}
        />
      )}

      {g.resultVisible && !g.paused && (
        <ResultModal
          game={game}
          players={players}
          humanSeat={humanSeat}
          saveStatus={g.saveStatus}
          onNextHand={g.nextHand}
          onRestartMatch={g.restartMatch}
          onHome={goHome}
        />
      )}

      {peek && game.completedTricks.length > 0 && (
        <LastTrickModal trick={game.completedTricks[game.completedTricks.length - 1]} players={players} onClose={() => setPeek(false)} />
      )}

      {g.paused && (
        <PauseMenu
          handNumber={game.handNumber}
          onResume={g.resume}
          onRestartHand={g.restartHand}
          onRestartMatch={g.restartMatch}
          onQuit={() => {
            g.quitMatch();
            goHome();
          }}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  column: { flex: 1 },
  handWrap: { alignItems: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
});
