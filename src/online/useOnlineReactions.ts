/**
 * useOnlineReactions.ts — emoji reactions through Firestore (rooms/{code}/reactions).
 *
 *  - send(emoji): shows it above MY seat at once (rate-limited, 1 per 2 s) and
 *    writes a ReactionDoc for my real seat; every other phone's listener shows it.
 *  - listener: only reactions sent after we joined (see listenReactions);
 *    my own echo is skipped; real seat → view seat so it floats above the sender.
 *  - host only: bots react now and then (useBotReactions) and the host writes
 *    those for the bot's seat (allowed by firestore.rules for bot seats only).
 *  The listener is removed when the room code changes or the screen unmounts.
 */
import { useCallback, useEffect, useRef } from 'react';

import type { Seat } from '@/game/types';
import { useFeedback } from '@/hooks/useFeedback';
import { useBotReactions, useReactions } from '@/hooks/useReactions';
import { isReactionEmoji, type ReactionEmoji } from '@/utils/reactions';

import type { LocalView } from './protocol';
import { listenReactions, sendReaction } from './roomService';

interface Options {
  roomCode: string | null;
  uid: string | null;
  mySeat: Seat | null;
  isHost: boolean;
  view: LocalView | null;
}

export function useOnlineReactions({ roomCode, uid, mySeat, isHost, view }: Options) {
  const reactions = useReactions();
  const { show } = reactions;
  const feedback = useFeedback();
  const latest = useRef({ view, mySeat });
  useEffect(() => {
    latest.current = { view, mySeat };
  });

  useEffect(() => {
    if (!roomCode || !uid) return;
    return listenReactions(
      roomCode,
      (list) => {
        const { view: v, mySeat: me } = latest.current;
        if (!v) return;
        for (const r of list) {
          if (r.seat === me || !isReactionEmoji(r.emoji) || r.seat < 0 || r.seat > 3) continue;
          show(v.viewSeat(r.seat as Seat), r.emoji);
        }
      },
      () => undefined,
    );
  }, [roomCode, uid, show]);

  const send = useCallback(
    (emoji: ReactionEmoji) => {
      if (!roomCode || !uid || mySeat === null) return;
      if (!show(0, emoji)) return; // rate-limited
      feedback.tap();
      sendReaction(roomCode, uid, mySeat, emoji).catch(() => undefined);
    },
    [roomCode, uid, mySeat, show, feedback],
  );

  const sendBot = useCallback(
    (seat: Seat, emoji: ReactionEmoji) => {
      const v = latest.current.view;
      if (!roomCode || !uid || !v) return;
      sendReaction(roomCode, uid, v.realSeat(seat), emoji).catch(() => undefined);
    },
    [roomCode, uid],
  );
  useBotReactions(view?.game ?? null, view?.players ?? [], isHost ? sendBot : null);

  return { bubbles: reactions.bubbles, enabled: reactions.enabled, canSend: reactions.enabled && mySeat !== null, send };
}
