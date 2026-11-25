/**
 * status.ts — builds the human-readable status lines shown in the action bar
 * (whose turn it is, who won the trick, the middle-pile streak).
 */
import { SUIT_NAMES } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import { canFollowSuit, ledSuit } from '@/game/rules';
import { STREAK_TO_COLLECT } from '@/game/rulesConfig';
import type { GameState, Seat, TrickRecord } from '@/game/types';

export function statusLine(
  game: GameState,
  players: PlayerProfile[],
  human: Seat,
  shown: TrickRecord | null,
  canReveal: boolean,
): string {
  const name = (s: Seat) => (s === human ? 'You' : players[s].name);
  switch (game.phase) {
    case 'DEAL_5':
    case 'DEAL_REST':
      return game.dealer === human ? 'You are dealing…' : `${players[game.dealer].name} is dealing…`;
    case 'BIDDING':
      return game.turn === human ? 'Your bid' : `${players[game.turn].name} is bidding…`;
    case 'CHOOSE_RANG':
      return game.bidder === human ? 'Choose your Rang' : `${players[game.bidder!].name} is choosing the Rang in secret…`;
    case 'HAND_OVER':
      return 'Hand complete';
    case 'PLAYING': {
      if (shown) {
        const who = name(shown.winner);
        const verb = shown.winner === human ? 'win' : 'wins';
        if (shown.outcome.type === 'pile') return `${who} ${verb} trick ${shown.number} → middle pile`;
        if (shown.outcome.type === 'collected')
          return `${who} ${verb} trick ${shown.number} — ${shown.outcome.count} trick${shown.outcome.count === 1 ? '' : 's'} collected!`;
        return `${who} ${verb} trick ${shown.number}`;
      }
      if (game.turn !== human) return `${players[game.turn].name} is thinking…`;
      const led = ledSuit(game.currentTrick);
      if (!led) return game.bidder === human && !game.rangRevealed ? 'Your lead — play any card (or reveal your Rang)' : 'Your lead — play any card';
      if (canFollowSuit(game.hands[human], game.currentTrick)) return `Your turn — follow ${SUIT_NAMES[led]}`;
      return `No ${SUIT_NAMES[led]} — play any card${canReveal ? ' or reveal the Rang' : ''}`;
    }
  }
}

/** "East won the last trick — one more to collect 3 tricks" (post-reveal only). */
export function streakLine(game: GameState, players: PlayerProfile[], human: Seat): string | null {
  if (!game.rangRevealed || game.phase !== 'PLAYING' || game.pile === 0 || game.streak.seat === null) return null;
  const s = game.streak.seat;
  const who = s === human ? 'You' : players[s].name;
  const remaining = STREAK_TO_COLLECT - game.streak.count;
  const n = game.pile + remaining;
  const more = remaining === 1 ? 'one more win' : `${remaining} more wins`;
  return `${who} won the last trick — ${more} collects ${n} tricks (pile: ${game.pile})`;
}
