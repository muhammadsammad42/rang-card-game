/**
 * rules.ts — small, pure rule helpers used by the engine, the bots and the UI.
 *
 * Seat/team arithmetic, follow-suit legality, who wins a trick, who may
 * reveal the Rang, and whether a hand's result is already decided.
 */
import { MIN_BID, MAX_BID, PARTNER_MAY_REVEAL } from './rulesConfig';
import type { Card, CurrentTrick, GameState, Play, Seat, Suit, Team } from './types';

export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const TRICKS_PER_HAND = 13;

/** The seat `step` places clockwise from `seat` (1 = the player to the left). */
export const nextSeat = (seat: Seat, step = 1): Seat => (((seat + step) % 4) + 4) % 4 as Seat;

/** Partners sit opposite, so seats 0 & 2 are Team A and 1 & 3 are Team B. */
export const teamOf = (seat: Seat): Team => (seat % 2 === 0 ? 'A' : 'B');
export const partnerOf = (seat: Seat): Seat => nextSeat(seat, 2);
export const otherTeam = (team: Team): Team => (team === 'A' ? 'B' : 'A');
export const isSeat = (value: unknown): value is Seat => value === 0 || value === 1 || value === 2 || value === 3;

/** The suit of the first card in the trick, or null if nobody has led yet. */
export const ledSuit = (trick: CurrentTrick): Suit | null => trick.plays[0]?.card.suit ?? null;

/** Can this hand follow the suit that was led? (Always true when leading.) */
export function canFollowSuit(hand: readonly Card[], trick: CurrentTrick): boolean {
  const led = ledSuit(trick);
  return led === null || hand.some((c) => c.suit === led);
}

/**
 * Follow-suit rule: if you hold the led suit you must play it; otherwise
 * (or when leading) any card is legal.
 */
export function legalCards(hand: readonly Card[], trick: CurrentTrick): Card[] {
  const led = ledSuit(trick);
  if (led === null) return hand.slice();
  const following = hand.filter((c) => c.suit === led);
  return following.length > 0 ? following : hand.slice();
}

/**
 * Does `challenger` beat the card currently winning the trick?
 * - With trump active, any trump beats any non-trump; higher trump beats lower trump.
 * - Otherwise only a higher card of the SAME suit wins; off-suit cards never win.
 * (The current best card is always of the led suit or trump.)
 */
export function beats(challenger: Card, best: Card, trump: Suit | null): boolean {
  const challengerTrump = trump !== null && challenger.suit === trump;
  const bestTrump = trump !== null && best.suit === trump;
  if (challengerTrump !== bestTrump) return challengerTrump;
  return challenger.suit === best.suit && challenger.rank > best.rank;
}

/**
 * Who wins a set of plays. Pass `trump = null` while the Rang is hidden
 * (highest card of the led suit wins) and the Rang suit after the reveal.
 */
export function trickWinner(plays: readonly Play[], trump: Suit | null): Seat {
  if (plays.length === 0) throw new Error('trickWinner: empty trick');
  let best = plays[0];
  for (const play of plays.slice(1)) if (beats(play.card, best.card, trump)) best = play;
  return best.seat;
}

/** Is `value` an acceptable bid given the current highest bid? Returns an error message or null. */
export function bidError(value: number, highest: number | null): string | null {
  if (!Number.isInteger(value) || value < MIN_BID || value > MAX_BID)
    return `Bids must be a whole number from ${MIN_BID} to ${MAX_BID}.`;
  if (highest !== null && value <= highest) return `You must bid higher than ${highest}.`;
  return null;
}

/**
 * Who may reveal the Rang right now? Returns null if `seat` may, otherwise
 * an explanation. Rules:
 *  - only during trick play, on your own turn, and only once;
 *  - the bidder may reveal at any time on their turn (even when leading);
 *  - any other player may reveal only when they cannot follow the led suit.
 */
export function revealError(state: GameState, seat: Seat): string | null {
  if (state.phase !== 'PLAYING') return 'The Rang can only be revealed during trick play.';
  if (state.rangRevealed) return 'The Rang has already been revealed.';
  if (state.turn !== seat) return 'You can only reveal the Rang on your turn.';
  if (state.bidder === null) return 'There is no bidder yet.';
  if (seat === state.bidder) return null;
  if (!PARTNER_MAY_REVEAL && teamOf(seat) === teamOf(state.bidder))
    return "The bidder's partner cannot reveal the Rang.";
  if (state.currentTrick.plays.length === 0) return 'Only the bidder may reveal the Rang when leading a trick.';
  if (canFollowSuit(state.hands[seat], state.currentTrick))
    return 'You can follow the led suit, so you cannot reveal the Rang.';
  return null;
}

/**
 * Has the hand's result become mathematically certain? Returns the team that
 * is guaranteed to win, or null if it is still open. Tricks in the middle pile
 * and unplayed tricks could still go to either team.
 */
export function lockedWinner(state: GameState): Team | null {
  if (state.bidder === null || state.bid === null) return null;
  const biddingTeam = teamOf(state.bidder);
  const defenders = otherTeam(biddingTeam);
  if (state.tricksWon[biddingTeam] >= state.bid) return biddingTeam;
  const maxForBidders = TRICKS_PER_HAND - state.tricksWon[defenders];
  if (maxForBidders < state.bid) return defenders;
  return null;
}
