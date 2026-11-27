/**
 * game.tsx — the Game Table screen.
 *
 * Layout (top → bottom): TopBar (pause, score, last-trick peek), InfoStrip
 * (bid, Rang status, tricks), the felt Table, the ActionBar (status, streak,
 * Reveal Rang) and your Hand. Phase-specific overlays sit on top: Bidding,
 * Choose Rang, Result, Pause menu and Last-trick peek.
 *
 * Flow of a card play: tap twice (or drag to the centre) in <Hand> →
 * useHandController.onPlay → GameProvider.playCard (validates) → engine
 * reducer → new state → re-render → TrickArea animates the card flying in.
 *
 * Highlighting: GameProvider.legalIds (from the engine) → useHandController →
 * buildHandView gives every card `isPlayable` + a state → <Hand> styles it.
 */
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useAnimatedRef } from 'react-native-reanimated';
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
import type { Card } from '@/game/types';
import { useFeedback } from '@/hooks/useFeedback';
import { useHandController } from '@/hooks/useHandController';
import { useLayout } from '@/hooks/useLayout';
import { useBotReactions, useReactions } from '@/hooks/useReactions';
import { useGameSounds, useSound } from '@/hooks/useSound';
import { gradients, motion, spacing } from '@/theme/theme';
import type { ReactionEmoji } from '@/utils/reactions';
import { statusInfo, streakChip } from '@/utils/status';

export default function GameScreen() {
  const g = useGame();
  const { game, players, humanSeat } = g;
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const [peek, setPeek] = useState(false);
  /** The centre drop zone on the table; <Hand> measures it while a card is dragged. */
  const dropZone = useAnimatedRef<View>();

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

  const myPlayTurn = game?.phase === 'PLAYING' && g.isHumanTurn && !g.shownTrick && !g.paused;
  const { playCard } = g;
  const play = useCallback((card: Card) => playCard(card.id), [playCard]);
  const hand = useHandController({ game, seat: humanSeat, legalIds: g.legalIds, canPlay: !!myPlayTurn, play });

  // Emoji reactions: mine float above my seat; bots react to tricks, the reveal and the result.
  const feedback = useFeedback();
  const sfx = useSound();
  useGameSounds(game, humanSeat);
  const reactions = useReactions();
  const { show } = reactions;
  const react = useCallback(
    (emoji: ReactionEmoji) => {
      if (show(humanSeat, emoji)) {
        feedback.tap();
        sfx('pop');
      }
    },
    [show, humanSeat, feedback, sfx],
  );
  useBotReactions(game, players, reactions.enabled ? show : null);

  const goHome = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);

  if (!game) return <LinearGradient colors={gradients.room} style={styles.screen} />;

  const shown = g.shownTrick?.record ?? null;
  const status = statusInfo(game, players, humanSeat, shown, g.canReveal);
  const handWidth = layout.contentWidth - spacing.sm * 2;

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
          dropZone={dropZone}
          dragState={hand.dragState}
          streak={streakChip(game, players, humanSeat)}
          reactions={reactions.bubbles}
          onReact={reactions.enabled ? react : null}
        />
        <ActionBar
          game={game}
          me={players[humanSeat]}
          humanSeat={humanSeat}
          isMyTurn={g.isHumanTurn && !g.shownTrick && game.phase !== 'DEAL_5' && game.phase !== 'DEAL_REST'}
          status={status}
          error={g.error ?? hand.hint}
          canReveal={g.canReveal && !g.paused}
          onReveal={g.reveal}
          sortMode={hand.sortMode}
          onToggleSort={hand.toggleSort}
        />
        <View style={styles.handWrap}>
          <Hand
            cards={hand.cards}
            width={handWidth}
            maxCardWidth={layout.handCardWidth}
            interactive={!!myPlayTurn}
            selectedId={hand.selectedId}
            onTap={hand.onTap}
            onPlay={hand.onPlay}
            onBlocked={hand.onBlocked}
            dropZone={dropZone}
            dragState={hand.dragState}
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
  handWrap: { alignItems: 'center', paddingHorizontal: spacing.sm, marginTop: spacing.xs },
});
