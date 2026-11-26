/**
 * useTableDisplay.ts — table "presentation" for online games: keeps each
 * finished trick on the table (hold → sweep) and raises the reveal / pile
 * collection events (animations, haptics, toasts).
 *
 * This mirrors what GameProvider does for single-player, but works from any
 * GameState (here: the network view), so the single-player provider stays
 * untouched. State changes only happen in timer callbacks; everything else
 * is derived during render.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import { SUIT_NAMES } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import type { GameState } from '@/game/types';
import { useToast } from '@/components/Toast';
import { TRICK_HOLD_MS, TRICK_SWEEP_MS, type GameEvents, type ShownTrick } from '@/context/GameProvider';
import { useFeedback } from '@/hooks/useFeedback';

export function useTableDisplay(game: GameState | null, players: PlayerProfile[]) {
  const toast = useToast();
  const feedback = useFeedback();
  const handKey = game ? `${game.handNumber}:${game.handSeed}` : '';
  const trickCount = game?.completedTricks.length ?? 0;

  const [acked, setAcked] = useState({ key: '', count: 0 });
  const ackedTricks = acked.key === handKey ? acked.count : 0;
  const [sweepAt, setSweepAt] = useState<{ key: string; trick: number } | null>(null);
  const sweeping = sweepAt !== null && sweepAt.key === handKey && sweepAt.trick === trickCount;

  const lastTrick = game && trickCount > ackedTricks ? game.completedTricks[trickCount - 1] : null;
  const shownTrick = useMemo<ShownTrick | null>(
    () => (lastTrick ? { record: lastTrick, stage: sweeping ? 'sweep' : 'hold' } : null),
    [lastTrick, sweeping],
  );

  // Hold the finished trick, then sweep it away.
  useEffect(() => {
    if (trickCount <= ackedTricks) return;
    const key = handKey;
    const trick = trickCount;
    const a = setTimeout(() => setSweepAt({ key, trick }), TRICK_HOLD_MS);
    const b = setTimeout(() => setAcked({ key, count: trick }), TRICK_HOLD_MS + TRICK_SWEEP_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [trickCount, ackedTricks, handKey]);

  // Events: counters bumped when a new network state shows a reveal or a collection.
  const [events, setEvents] = useState<GameEvents>({ revealSeq: 0, collectSeq: 0 });
  const gameRef = useRef(game);
  const playersRef = useRef(players);
  useEffect(() => {
    gameRef.current = game;
    playersRef.current = players;
  });

  const seenTricks = useRef(0);
  useEffect(() => {
    const g = gameRef.current;
    const prev = seenTricks.current;
    seenTricks.current = trickCount;
    if (!g || trickCount <= prev) return;
    const record = g.completedTricks[trickCount - 1];
    if (record?.outcome.type === 'collected') {
      const { team, count, leftover } = record.outcome;
      setEvents((e) => ({ ...e, collectSeq: e.collectSeq + 1 }));
      feedback.success();
      const who = leftover ? (team === 'A' ? 'Your team' : 'The opponents') : playersRef.current[record.winner]?.name;
      toast.show(
        leftover ? `${who} took the ${count} leftover trick${count === 1 ? '' : 's'}` : `${who} collected ${count} trick${count === 1 ? '' : 's'} from the pile!`,
        team === 'A' ? 'success' : 'warning',
      );
    }
  }, [trickCount, handKey, feedback, toast]);

  const revealed = game?.rangRevealed ?? false;
  const wasRevealed = useRef(revealed);
  useEffect(() => {
    const g = gameRef.current;
    const before = wasRevealed.current;
    wasRevealed.current = revealed;
    if (!revealed || before || !g || g.revealedBy === null || !g.rangSuit) return;
    setEvents((e) => ({ ...e, revealSeq: e.revealSeq + 1 }));
    feedback.warning();
    toast.show(`${playersRef.current[g.revealedBy]?.name} revealed the Rang: ${SUIT_NAMES[g.rangSuit]}`, 'warning');
  }, [revealed, feedback, toast]);

  const resultVisible = !!game && game.phase === 'HAND_OVER' && !shownTrick;
  return { shownTrick, events, resultVisible };
}
