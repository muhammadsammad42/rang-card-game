/**
 * rulesConfig.ts — every Rang rule decision that the reference game does not
 * spell out, collected in ONE place as named constants.
 *
 * If you discover the reference game behaves differently, change the value
 * here; the engine (engine.ts) and the tests read these constants instead of
 * hard-coding the behaviour.
 */
import type { Seat } from './types';

/** Lowest and highest bids allowed (number of tricks the team promises). */
export const MIN_BID = 8;
export const MAX_BID = 13;

/** Cards dealt before bidding, and in the second deal after the Rang is chosen. */
export const FIRST_DEAL_SIZE = 5;
export const SECOND_DEAL_SIZE = 8;

/**
 * Who deals the very first hand of a match.
 * 'random' picks a seat from the match seed; a number fixes the seat
 * (e.g. 3 = East deals, so South — the human — bids first).
 */
export const FIRST_DEALER: Seat | 'random' = 'random';

/**
 * Who bids first: the player this many seats clockwise from the dealer.
 * 1 = the player to the dealer's left (the usual card-table convention).
 */
export const FIRST_BIDDER_OFFSET = 1;

/**
 * If all four players pass, this player becomes the bidder (offset from the
 * dealer, clockwise; 1 = dealer's left, i.e. the first player at the table)...
 */
export const ALL_PASS_BIDDER_OFFSET = 1;
/** ...with this forced bid. */
export const ALL_PASS_FORCED_BID = MIN_BID;

/** A bid of MAX_BID ends the bidding immediately (nobody can outbid it). */
export const MAX_BID_ENDS_BIDDING = true;

/**
 * Is the trick in which the Rang gets revealed treated as a "post-reveal"
 * trick for the middle-pile rule? (It is always JUDGED with trump rules.)
 * true  = it goes to the middle pile and starts the winner's streak.
 * false = it goes straight to the winning team like a pre-reveal trick.
 */
export const REVEAL_TRICK_USES_PILE = true;

/** How many consecutive post-reveal wins by the SAME player collect the pile. */
export const STREAK_TO_COLLECT = 2;

/**
 * After a player collects the pile, does their streak reset?
 * true  = they need STREAK_TO_COLLECT fresh wins to collect again.
 * false = the streak keeps counting, so every further consecutive win by
 *         the same player is collected immediately.
 */
export const RESET_STREAK_AFTER_COLLECTION = true;

/**
 * Who receives tricks still sitting in the middle pile after trick 13.
 * 'lastTrickWinner' = the team that won the final trick.
 * 'biddingTeam' / 'defendingTeam' = always that team.
 */
export const LEFTOVER_PILE_OWNER: 'lastTrickWinner' | 'biddingTeam' | 'defendingTeam' =
  'lastTrickWinner';

/**
 * When the bidder's turn arrives and their only remaining card is the hidden
 * Rang card, reveal it automatically (true). If false, the bidder must press
 * "Reveal Rang" themselves (it is then their only legal action).
 */
export const AUTO_REVEAL_FOR_BIDDER = true;

/**
 * May a player who cannot follow suit reveal the Rang even when they are on
 * the bidding team (the bidder's partner)? The reference allows "any player".
 */
export const PARTNER_MAY_REVEAL = true;

/** Grouped export so the UI / docs can list the active configuration. */
export const RULES = {
  MIN_BID,
  MAX_BID,
  FIRST_DEAL_SIZE,
  SECOND_DEAL_SIZE,
  FIRST_DEALER,
  FIRST_BIDDER_OFFSET,
  ALL_PASS_BIDDER_OFFSET,
  ALL_PASS_FORCED_BID,
  MAX_BID_ENDS_BIDDING,
  REVEAL_TRICK_USES_PILE,
  STREAK_TO_COLLECT,
  RESET_STREAK_AFTER_COLLECTION,
  LEFTOVER_PILE_OWNER,
  AUTO_REVEAL_FOR_BIDDER,
  PARTNER_MAY_REVEAL,
} as const;
