/**
 * status.ts — builds the short, human-readable messages for the status bar
 * (whose turn it is, who won the trick) and the middle-pile streak chip.
 *
 * `statusInfo` also returns a `tone`, which the status bar turns into an icon
 * and colour (your turn = gold hand, waiting = clock, trick won = trophy…).
 */
import { suitText as suit } from './handView';
import type { PlayerProfile } from '@/game/players';
import { canFollowSuit, ledSuit } from '@/game/rules';
import { STREAK_TO_COLLECT } from '@/game/rulesConfig';
import type { GameState, Seat, TrickRecord } from '@/game/types';

export type StatusTone = 'turn' | 'wait' | 'win' | 'lose' | 'pile' | 'deal' | 'info';

export interface StatusInfo {
  text: string;
  tone: StatusTone;
}

export function statusInfo(
  game: GameState,
  players: PlayerProfile[],
  human: Seat,
  shown: TrickRecord | null,
  canReveal: boolean,
): StatusInfo {
  const name = (s: Seat) => (s === human ? 'You' : players[s].name);
  switch (game.phase) {
    case 'DEAL_5':
    case 'DEAL_REST':
      return { text: game.dealer === human ? 'You are dealing…' : `${players[game.dealer].name} is dealing…`, tone: 'deal' };
    case 'BIDDING':
      return game.turn === human
        ? { text: 'Your bid', tone: 'turn' }
        : { text: `Waiting for ${players[game.turn].name} to bid…`, tone: 'wait' };
    case 'CHOOSE_RANG':
      return game.bidder === human
        ? { text: 'Choose your Rang', tone: 'turn' }
        : { text: `${players[game.bidder!].name} is choosing the Rang in secret…`, tone: 'wait' };
    case 'HAND_OVER':
      return { text: 'Hand complete', tone: 'info' };
    case 'PLAYING': {
      if (shown) {
        const who = name(shown.winner);
        const verb = shown.winner === human ? 'win' : 'wins';
        const ours = shown.winner % 2 === human % 2;
        if (shown.outcome.type === 'pile') return { text: `${who} ${verb} trick ${shown.number} → middle pile`, tone: 'pile' };
        if (shown.outcome.type === 'collected')
          return {
            text: `${who} ${verb} trick ${shown.number} — ${shown.outcome.count} trick${shown.outcome.count === 1 ? '' : 's'} collected!`,
            tone: ours ? 'win' : 'lose',
          };
        return { text: `${who} ${verb} trick ${shown.number}`, tone: ours ? 'win' : 'lose' };
      }
      if (game.turn !== human) return { text: `Waiting for ${players[game.turn].name}…`, tone: 'wait' };
      const led = ledSuit(game.currentTrick);
      if (!led) return { text: 'Your lead: play any card', tone: 'turn' };
      if (canFollowSuit(game.hands[human], game.currentTrick)) return { text: `Your turn: follow ${suit(led)}`, tone: 'turn' };
      // canReveal is shown by the pulsing Reveal button + hint, so the status stays short.
      return { text: canReveal ? `No ${suit(led)}: any card` : `No ${suit(led)}: play any card`, tone: 'turn' };
    }
  }
}

/** Text-only version of statusInfo (kept for callers that only need the words). */
export function statusLine(...args: Parameters<typeof statusInfo>): string {
  return statusInfo(...args).text;
}

/** "East won the last trick — one more win collects 3 tricks (pile: 2)" (post-reveal only). */
export function streakLine(game: GameState, players: PlayerProfile[], human: Seat): string | null {
  if (!game.rangRevealed || game.phase !== 'PLAYING' || game.pile === 0 || game.streak.seat === null) return null;
  const s = game.streak.seat;
  const who = s === human ? 'You' : players[s].name;
  const remaining = STREAK_TO_COLLECT - game.streak.count;
  const n = game.pile + remaining;
  const more = remaining === 1 ? 'one more win' : `${remaining} more wins`;
  return `${who} won the last trick — ${more} collects ${n} tricks (pile: ${game.pile})`;
}

/** Compact version for the chip under the middle pile: "Abdullah won last · 1 more → 3 tricks". */
export function streakChip(game: GameState, players: PlayerProfile[], human: Seat): string | null {
  if (!game.rangRevealed || game.phase !== 'PLAYING' || game.pile === 0 || game.streak.seat === null) return null;
  const s = game.streak.seat;
  const who = s === human ? 'You' : players[s].name;
  const remaining = STREAK_TO_COLLECT - game.streak.count;
  return `${who} won last · ${remaining} more → ${game.pile + remaining} tricks`;
}
