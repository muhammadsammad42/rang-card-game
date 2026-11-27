/**
 * gameSounds.ts — which sound effects a game-state change should make (pure).
 *
 * At most one "event" sound per change (the most important one wins:
 * win/lose > reveal > pile collected > trick won > bid > your turn > deal),
 * plus a card flick when ANOTHER player put a card down (my own cards make
 * their sound straight from the hand, see useHandController).
 */
import { teamOf } from '@/game/rules';
import type { GameState, Seat } from '@/game/types';
import type { SoundName } from '@/theme/sounds';

export function gameSoundsFor(prev: GameState | null, next: GameState | null, mySeat: Seat | null): SoundName[] {
  if (!next) return [];
  const dealing = next.phase === 'DEAL_5' || next.phase === 'DEAL_REST';
  const newHand = !prev || prev.handNumber !== next.handNumber || prev.handSeed !== next.handSeed;
  if (newHand) return dealing ? ['deal'] : [];
  if (!prev) return [];

  const me = mySeat;
  const out: SoundName[] = [];
  const tricksDone = next.completedTricks.length === prev.completedTricks.length + 1;

  if (prev.phase !== 'HAND_OVER' && next.phase === 'HAND_OVER' && next.result) {
    out.push(teamOf(me ?? 0) === next.result.winnerTeam ? 'win' : 'lose');
  } else if (!prev.rangRevealed && next.rangRevealed) {
    out.push('reveal');
  } else if (next.pile < prev.pile) {
    out.push('pile');
  } else if (tricksDone && next.completedTricks[next.completedTricks.length - 1].outcome.type !== 'pile') {
    out.push('trick');
  } else if (next.bids.length > prev.bids.length && typeof next.bids[next.bids.length - 1].value === 'number') {
    out.push('bid');
  } else if (me !== null && next.turn === me && (prev.turn !== me || prev.phase !== next.phase) && (next.phase === 'BIDDING' || next.phase === 'PLAYING')) {
    out.push('turn');
  } else if (dealing && prev.phase !== next.phase) {
    out.push('deal');
  }

  // Someone else's card hit the table.
  const plays = tricksDone ? next.completedTricks[next.completedTricks.length - 1].plays : next.currentTrick.plays;
  const added = tricksDone || next.currentTrick.plays.length > prev.currentTrick.plays.length;
  const last = plays[plays.length - 1];
  if (added && last && last.seat !== me && next.phase !== 'HAND_OVER') out.push('play');
  return out;
}
