/**
 * useReactions.ts — the floating emoji reactions on the table (no text chat).
 *
 *   show(seat, emoji) → bubble floats above that seat for REACTION_SHOW_MS.
 *   Each seat is rate-limited (1 per 2 s), and nothing is shown when the
 *   "Reactions" setting is off. Used the same way offline and online; online,
 *   useOnlineReactions feeds Firestore reactions into show().
 *
 * useBotReactions watches the game and lets bots react now and then
 * (utils/reactions.botReactions decides who, what and whether).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useSettings } from '@/context/SettingsProvider';
import type { PlayerProfile } from '@/game/players';
import type { GameState, Seat } from '@/game/types';
import { botReactions, createRateLimiter, REACTION_SHOW_MS, type ReactionEmoji } from '@/utils/reactions';

export interface ReactionBubble {
  id: number;
  /** View seat (0 = me). */
  seat: Seat;
  emoji: ReactionEmoji;
}

export function useReactions() {
  const { settings } = useSettings();
  const enabled = settings.reactions;
  const [bubbles, setBubbles] = useState<ReactionBubble[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const allow = useRef(createRateLimiter());
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);

  /** Shows a reaction above `seat`. Returns false if it was dropped (setting off or rate limit). */
  const show = useCallback((seat: Seat, emoji: ReactionEmoji): boolean => {
    if (!enabledRef.current || !allow.current(seat, Date.now())) return false;
    const id = nextId.current++;
    setBubbles((list) => [...list.filter((b) => b.seat !== seat), { id, seat, emoji }]);
    const t = setTimeout(() => {
      timers.current.delete(t);
      setBubbles((list) => list.filter((b) => b.id !== id));
    }, REACTION_SHOW_MS);
    timers.current.add(t);
    return true;
  }, []);

  // Turning the setting off hides anything still floating.
  return { bubbles: enabled ? bubbles : [], show, enabled };
}

/** Lets bots react to the game (trick won, Rang revealed, hand over). `send` receives view seats. */
export function useBotReactions(game: GameState | null, players: PlayerProfile[], send: ((seat: Seat, emoji: ReactionEmoji) => void) | null) {
  const prev = useRef(game);
  const latest = useRef({ players, send });
  useEffect(() => {
    latest.current = { players, send };
  });
  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    const { players: ps, send: fn } = latest.current;
    if (!fn) return;
    const list = botReactions(before, game, (s) => !!ps[s]?.isBot);
    // Small random delay so a bot doesn't react at the exact same frame as the event.
    const timers = list.map((r, i) => setTimeout(() => fn(r.seat, r.emoji), 500 + i * 700 + Math.random() * 600));
    return () => timers.forEach(clearTimeout);
  }, [game]);
}
