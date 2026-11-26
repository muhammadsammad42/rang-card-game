/**
 * useOnlineHistory.ts — when an online hand ends, THIS device saves its own
 * record to the existing `games` collection (each human player keeps their
 * own history), tagged mode "online" with the room code and which seats were
 * bots. It also updates the local stats shown on the Home screen.
 */
import { useEffect, useRef, useState } from 'react';

import type { PlayerProfile } from '@/game/players';
import type { GameState } from '@/game/types';
import { saveHandResult } from '@/services/historyService';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'queued' | 'offline';

export function useOnlineHistory(
  game: GameState | null,
  players: PlayerProfile[],
  roomCode: string | null,
  recordHand: (entry: { won: boolean; wasBidder: boolean; bid: number | null }) => void,
): SaveStatus {
  const handKey = game ? `${game.handNumber}:${game.handSeed}` : '';
  const [save, setSave] = useState<{ key: string; status: SaveStatus }>({ key: '', status: 'idle' });
  const startedAt = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const saved = useRef('');

  // Remember when each hand started (for durationSeconds).
  useEffect(() => {
    if (handKey && startedAt.current.key !== handKey) startedAt.current = { key: handKey, at: Date.now() };
  }, [handKey]);

  const over = game?.phase === 'HAND_OVER' && !!game.result;
  useEffect(() => {
    if (!over || !game?.result || !roomCode || saved.current === handKey) return;
    saved.current = handKey;
    const key = handKey;
    const duration = Math.round((Date.now() - (startedAt.current.at || Date.now())) / 1000);
    // In the local view I am seat 0 and my team is always "A".
    recordHand({ won: game.result.winnerTeam === 'A', wasBidder: game.result.bidder === 0, bid: game.result.bid });
    setSave({ key, status: 'saving' });
    saveHandResult(game, players, duration, {
      mode: 'online',
      roomCode,
      botSeats: players.filter((p) => p.isBot).map((p) => p.seat),
    })
      .then((status) => setSave({ key, status }))
      .catch(() => setSave({ key, status: 'queued' }));
  }, [over, game, players, roomCode, handKey, recordHand]);

  return save.key === handKey ? save.status : 'idle';
}
