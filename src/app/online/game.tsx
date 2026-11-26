/**
 * online/game.tsx — the online Game Table.
 *
 * Reuses the single-player table components (Table, Hand, ActionBar,
 * BiddingPanel, RangPicker, ResultModal…) with the local view from
 * OnlineRoomProvider, so online play looks and animates exactly like offline.
 *
 * Flow of a move: tap → useOnline().move (checked locally with the engine)
 *   → host: applied at once / others: ActionDoc sent → the host validates it
 *   with the engine → publishes the new state → every phone re-renders.
 */
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionBar } from '@/components/ActionBar';
import { BiddingPanel } from '@/components/BiddingPanel';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ConnectionDot } from '@/components/ConnectionDot';
import { Hand } from '@/components/Hand';
import { LastTrickModal } from '@/components/LastTrickModal';
import { LottieAnim } from '@/components/LottieAnim';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RangPicker } from '@/components/RangPicker';
import { ResultModal } from '@/components/ResultModal';
import { InfoStrip, TopBar } from '@/components/ScoreBoard';
import { Table } from '@/components/Table';
import { useToast } from '@/components/Toast';
import { useSettings } from '@/context/SettingsProvider';
import { sortHand } from '@/game/deck';
import type { Card } from '@/game/types';
import { useFeedback } from '@/hooks/useFeedback';
import { useLayout } from '@/hooks/useLayout';
import { useOnline } from '@/online/OnlineRoomProvider';
import { useOnlineHistory } from '@/online/useOnlineHistory';
import { useTableDisplay } from '@/online/useTableDisplay';
import { colors, gradients, motion, radii, spacing, typography } from '@/theme/theme';
import { statusLine, streakLine } from '@/utils/status';

const ME = 0 as const; // in the local view I am always seat 0 (South)

export default function OnlineGameScreen() {
  const o = useOnline();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const feedback = useFeedback();
  const toast = useToast();
  const { recordHand } = useSettings();
  const [selected, setSelected] = useState<{ id: string; hand: string } | null>(null);
  const [peek, setPeek] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const view = o.view;
  const game = view?.game ?? null;
  const players = useMemo(() => view?.players ?? [], [view]);
  const { shownTrick, events, resultVisible } = useTableDisplay(game, players);
  const saveStatus = useOnlineHistory(game, players, o.roomCode, recordHand);

  // No room → online menu. Room went back to the lobby (shouldn't happen) → lobby.
  useEffect(() => {
    if (!o.roomCode) router.replace('/online/menu');
    else if (o.room?.status === 'lobby') router.replace('/online/lobby');
  }, [o.roomCode, o.room?.status]);

  // Announcements from the host (e.g. a player was replaced by a bot).
  const lastNotice = useRef<number | null>(null);
  const notice = o.room?.notice ?? null;
  useEffect(() => {
    if (!notice || notice.id === lastNotice.current) return;
    lastNotice.current = notice.id;
    toast.show(notice.text, 'warning');
  }, [notice, toast]);

  // Android back → confirm leaving (there is no pause in online games).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setConfirmLeave(true);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const leave = useCallback(async () => {
    setConfirmLeave(false);
    await o.leaveRoom();
    router.replace('/');
  }, [o]);

  const hand = useMemo(() => (game ? sortHand(game.hands[ME]) : []), [game]);
  const handKey = game ? `${game.handNumber}:${game.handSeed}` : '';
  const activeSelection =
    selected && selected.hand === handKey && hand.some((c) => c.id === selected.id) ? selected.id : null;

  const seated = o.mySeat !== null;
  const myTurnNow = seated && o.isMyTurn && !shownTrick && !o.pendingMove;
  const myPlayTurn = myTurnNow && game?.phase === 'PLAYING';

  const play = useCallback((card: Card) => o.move({ type: 'PLAY_CARD', cardId: card.id }), [o]);

  const onTap = useCallback(
    (card: Card) => {
      if (!seated) return;
      if (myPlayTurn && !o.legalIds.has(card.id)) {
        play(card); // explains why (message + shake)
        return;
      }
      if (activeSelection === card.id) {
        if (!myPlayTurn) return; // not my turn: cards can be looked at, not played
        if (play(card)) {
          setSelected(null);
          feedback.play();
        }
      } else {
        setSelected({ id: card.id, hand: handKey });
        feedback.tap();
      }
    },
    [seated, myPlayTurn, o.legalIds, activeSelection, play, feedback, handKey],
  );
  const onSwipe = useCallback(
    (card: Card) => {
      if (myPlayTurn && play(card)) {
        setSelected(null);
        feedback.play();
      }
    },
    [myPlayTurn, play, feedback],
  );

  if (!game || !view) {
    return (
      <LinearGradient colors={gradients.room} style={[styles.screen, styles.center]}>
        <LottieAnim name="loading" style={{ width: 100, height: 100 }} />
        <Text style={[typography.body, { color: colors.textMuted }]}>Waiting for the table…</Text>
      </LinearGradient>
    );
  }

  const shown = shownTrick?.record ?? null;
  const turnPlayer = players[game.turn];
  const waitingForHuman =
    !shown && game.turn !== ME && !turnPlayer?.isBot && (game.phase === 'BIDDING' || game.phase === 'CHOOSE_RANG' || game.phase === 'PLAYING');
  const status = !seated
    ? 'You are watching — a bot is playing your seat.'
    : o.pendingMove
      ? 'Sending your move…'
      : waitingForHuman
        ? `Waiting for ${turnPlayer.name}…`
        : statusLine(game, players, ME, shown, o.canReveal);
  const streak = streakLine(game, players, ME);
  const handWidth = layout.contentWidth - spacing.md * 2;
  const position = (ME - game.dealer + 4) % 4;
  const perCard = game.phase === 'DEAL_REST' ? motion.deal * 0.55 : motion.deal;
  const dealOffset = ((position + 3) % 4) * perCard;

  return (
    <LinearGradient colors={gradients.room} style={styles.screen}>
      <View style={[styles.column, { paddingTop: insets.top + spacing.xs, paddingBottom: insets.bottom + spacing.xs, width: layout.contentWidth }]}>
        <TopBar
          game={game}
          onPause={() => setConfirmLeave(true)}
          onPeek={() => setPeek(true)}
          leftIcon="exit-run"
          leftLabel="Leave room"
          subtitle={
            <View style={styles.roomLine}>
              <Text style={[typography.micro, { color: colors.gold }]}>Room {o.roomCode}</Text>
              <ConnectionDot synced={o.synced} online={o.online} compact />
            </View>
          }
        />
        {!o.online && <OfflineBanner message="Connection lost — moves will sync when you're back online." />}
        <View style={{ height: spacing.sm }} />
        <InfoStrip game={game} players={players} humanSeat={ME} />
        <View style={{ height: spacing.sm }} />
        <Table
          game={game}
          players={players}
          humanSeat={ME}
          shownTrick={shownTrick}
          events={events}
          seatSize={layout.seatSize}
          maxTrickCardWidth={layout.trickCardWidth}
        />
        <ActionBar
          game={game}
          me={players[ME]}
          humanSeat={ME}
          isMyTurn={myTurnNow && game.phase !== 'DEAL_5' && game.phase !== 'DEAL_REST'}
          status={status}
          streak={streak}
          error={o.moveError}
          canReveal={o.canReveal && myTurnNow}
          onReveal={() => o.move({ type: 'REVEAL_RANG' })}
        />
        {!seated && (
          <View style={styles.spectator}>
            <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
              Your seat was given to a bot while you were away. You will get it back when the host deals the next hand.
            </Text>
          </View>
        )}
        <View style={styles.handWrap}>
          <Hand
            cards={hand}
            width={handWidth}
            cardWidth={layout.handCardWidth}
            legalIds={o.legalIds}
            showLegality={!!myPlayTurn}
            selectedId={activeSelection}
            onTap={onTap}
            onSwipe={onSwipe}
            shakeSeq={o.moveError?.seq ?? 0}
            dealStagger={perCard * 4}
            dealOffset={dealOffset}
          />
        </View>
      </View>

      {game.phase === 'BIDDING' && seated && (
        <BiddingPanel
          game={game}
          players={players}
          humanSeat={ME}
          isHumanTurn={myTurnNow}
          cardWidth={Math.min(64, layout.handCardWidth * 0.85)}
          onBid={(value) => o.move({ type: 'BID', value })}
          onPass={() => o.move({ type: 'PASS' })}
        />
      )}

      {game.phase === 'CHOOSE_RANG' && game.bidder === ME && seated && (
        <RangPicker
          cards={game.hands[ME]}
          bid={game.bid ?? 8}
          forced={game.forcedBid}
          cardWidth={Math.min(66, layout.handCardWidth * 0.85)}
          onConfirm={(cardId) => o.move({ type: 'CHOOSE_RANG', cardId })}
        />
      )}

      {resultVisible && (
        <ResultModal
          game={game}
          players={players}
          humanSeat={ME}
          saveStatus={saveStatus}
          canContinue={o.isHost}
          homeLabel="Leave Room"
          onNextHand={o.nextHand}
          onRestartMatch={o.restartMatch}
          onHome={() => setConfirmLeave(true)}
        />
      )}

      {peek && game.completedTricks.length > 0 && (
        <LastTrickModal trick={game.completedTricks[game.completedTricks.length - 1]} players={players} onClose={() => setPeek(false)} />
      )}

      {confirmLeave && (
        <ConfirmDialog
          title="Leave the room?"
          message={
            o.isHost
              ? 'You are the host — leaving ends the game for everyone.'
              : 'A bot will take over your seat. Finished hands are already saved in your history.'
          }
          confirmLabel="Leave"
          danger
          onCancel={() => setConfirmLeave(false)}
          onConfirm={leave}
        />
      )}

      {o.closedReason && (
        <ConfirmDialog title="Game over" message={o.closedReason} confirmLabel="Back to Home" onCancel={leave} onConfirm={leave} />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  center: { justifyContent: 'center', gap: spacing.md },
  column: { flex: 1 },
  roomLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 },
  handWrap: { alignItems: 'center', paddingHorizontal: spacing.md, marginTop: spacing.xs },
  spectator: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.glass,
  },
});
