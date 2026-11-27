/**
 * reactions.ts — pure helpers for emoji reactions (no text chat, by design).
 *
 *  - REACTION_EMOJIS: the only 10 emojis that can be sent (also enforced in firestore.rules);
 *  - createRateLimiter: 1 reaction per REACTION_COOLDOWN_MS per seat/player;
 *  - botReactions: compares two game states and, with a random chance, picks
 *    a reaction for a bot (trick won, Rang revealed, hand won/lost).
 */
import { teamOf } from '@/game/rules';
import type { GameState, Seat } from '@/game/types';

export const REACTION_EMOJIS = ['😀', '😂', '😮', '😢', '😡', '👍', '🎉', '🔥', '👑', '🤔'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const REACTION_COOLDOWN_MS = 2000;
/** How long a reaction floats above a seat. */
export const REACTION_SHOW_MS = 2500;

export const isReactionEmoji = (v: unknown): v is ReactionEmoji => typeof v === 'string' && (REACTION_EMOJIS as readonly string[]).includes(v);

/** Returns `allow(key, now)`: true at most once per `cooldown` ms per key. */
export function createRateLimiter(cooldown = REACTION_COOLDOWN_MS) {
  const last = new Map<string | number, number>();
  return (key: string | number, now: number): boolean => {
    const prev = last.get(key);
    if (prev !== undefined && now - prev < cooldown) return false;
    last.set(key, now);
    return true;
  };
}

export interface BotReaction {
  seat: Seat;
  emoji: ReactionEmoji;
}

/** Chance that a bot reacts to each kind of event. */
export const BOT_CHANCE = { trick: 0.2, reveal: 0.45, result: 0.5 } as const;

const pick = <T,>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length) % list.length];

/**
 * Bot reactions caused by going from `prev` to `next` (same hand only).
 * At most one reaction per event, two for the end of a hand.
 */
export function botReactions(prev: GameState | null, next: GameState | null, isBot: (seat: Seat) => boolean, rng: () => number = Math.random): BotReaction[] {
  if (!prev || !next || prev.handNumber !== next.handNumber || prev.handSeed !== next.handSeed) return [];
  const bots = ([0, 1, 2, 3] as Seat[]).filter(isBot);
  if (bots.length === 0) return [];
  const out: BotReaction[] = [];

  // Hand finished → a winner cheers, a loser sulks.
  if (prev.phase !== 'HAND_OVER' && next.phase === 'HAND_OVER' && next.result) {
    const winner = next.result.winnerTeam;
    for (const seat of bots) {
      if (out.length >= 2 || rng() >= BOT_CHANCE.result) continue;
      out.push({ seat, emoji: teamOf(seat) === winner ? pick(['🎉', '👑', '😀', '🔥'] as const, rng) : pick(['😢', '😡', '🤔'] as const, rng) });
    }
    return out;
  }

  // The Rang was revealed → someone is surprised.
  if (!prev.rangRevealed && next.rangRevealed) {
    if (rng() < BOT_CHANCE.reveal) out.push({ seat: pick(bots, rng), emoji: pick(['😮', '🤔', '🔥'] as const, rng) });
    return out;
  }

  // A trick was won by a bot.
  if (next.completedTricks.length === prev.completedTricks.length + 1) {
    const t = next.completedTricks[next.completedTricks.length - 1];
    if (t.outcome.type !== 'pile' && isBot(t.winner) && rng() < BOT_CHANCE.trick) {
      out.push({ seat: t.winner, emoji: pick(['😀', '🔥', '👍', '😂'] as const, rng) });
    }
  }
  return out;
}
