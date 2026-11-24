/**
 * types.ts — all TypeScript types shared by the Rang game engine.
 *
 * Pure data only (no React). The engine, the bots, the UI and the history
 * service all speak in these types.
 */

/** S = Spades, H = Hearts, D = Diamonds, C = Clubs. */
export type Suit = 'S' | 'H' | 'D' | 'C';

/** 2..10 are face value; J = 11, Q = 12, K = 13, A = 14 (Ace is high). */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  /** Stable unique id such as "AS", "10H", "2C". */
  id: string;
  suit: Suit;
  rank: Rank;
}

/** Seats clockwise: 0 = South (human), 1 = West, 2 = North (partner), 3 = East. */
export type Seat = 0 | 1 | 2 | 3;

/** Team A = seats 0 & 2 (human's team); Team B = seats 1 & 3. */
export type Team = 'A' | 'B';

/** The game's state machine. */
export type Phase =
  | 'DEAL_5' // first 5 cards dealt, UI animates the deal
  | 'BIDDING' // one round of bids/passes
  | 'CHOOSE_RANG' // bidder places one card face down as the hidden trump
  | 'DEAL_REST' // remaining 8 cards each, UI animates the deal
  | 'PLAYING' // 13 tricks
  | 'HAND_OVER'; // result shown, waiting for Next Hand / Restart

export type BidValue = number | 'pass';

export interface BidEntry {
  seat: Seat;
  value: BidValue;
}

export interface Play {
  seat: Seat;
  card: Card;
}

/** Where a finished trick went (needed for the middle-pile rule and the log). */
export type TrickOutcome =
  /** Pre-reveal: straight to the winning team. */
  | { type: 'team'; team: Team }
  /** Post-reveal: placed in the middle pile (pileSize = pile size after adding it). */
  | { type: 'pile'; pileSize: number }
  /** Post-reveal: the winner's streak collected the whole pile (this trick included). */
  | { type: 'collected'; team: Team; count: number; leftover?: boolean };

export interface TrickRecord {
  /** 1-based trick number within the hand. */
  number: number;
  leader: Seat;
  plays: Play[];
  winner: Seat;
  /** Was the Rang revealed when this trick was judged (trump rules active)? */
  trumpActive: boolean;
  /** Was the Rang revealed during this trick? */
  revealedHere: boolean;
  outcome: TrickOutcome;
}

/** The trick currently being played. */
export interface CurrentTrick {
  leader: Seat;
  plays: Play[];
}

/** Consecutive post-reveal trick wins by one player (for collecting the pile). */
export interface Streak {
  seat: Seat | null;
  count: number;
}

export interface HandResult {
  bidder: Seat;
  bid: number;
  biddingTeam: Team;
  winnerTeam: Team;
  rangSuit: Suit;
  revealedAtTrick: number | null;
  revealedBy: Seat | null;
  tricksWon: Record<Team, number>;
  /** Tricks left in the middle pile after trick 13 and who received them. */
  leftover: { team: Team; count: number } | null;
  /** Was the bidder forced to bid because all four passed? */
  forcedBid: boolean;
}

export interface GameState {
  phase: Phase;
  /** Seed used to shuffle the current hand (makes every hand reproducible). */
  handSeed: number;
  /** 1-based hand counter within the match. */
  handNumber: number;
  dealer: Seat;
  /** The seat that dealt hand 1 (used by Restart Match). */
  firstDealer: Seat;
  /** Whose turn it is to act (bid, choose Rang, reveal or play). */
  turn: Seat;

  /** Cards in each seat's hand (index = seat). Never shown to other seats. */
  hands: Card[][];
  /** Undealt cards (the 32 dealt after the Rang is chosen). Secret. */
  stock: Card[];

  // ---- bidding ----
  bids: BidEntry[];
  highestBid: { seat: Seat; value: number } | null;
  bidder: Seat | null;
  bid: number | null;
  forcedBid: boolean;

  // ---- the Rang (hidden trump) ----
  /** The face-down card. Secret: only the bidder may know it until revealed. */
  hiddenCard: Card | null;
  /** The Rang suit. Secret until revealed (except to the bidder). */
  rangSuit: Suit | null;
  rangRevealed: boolean;
  /** 1-based trick number in which the Rang was revealed. */
  revealedAtTrick: number | null;
  revealedBy: Seat | null;
  /** True if the reveal was automatic (bidder had only the hidden card left). */
  autoRevealed: boolean;

  // ---- trick play ----
  currentTrick: CurrentTrick;
  /** Has the Rang been revealed during the current (unfinished) trick? */
  revealedThisTrick: boolean;
  completedTricks: TrickRecord[];
  /** Tricks actually collected by each team. */
  tricksWon: Record<Team, number>;
  /** Post-reveal tricks waiting in the middle. */
  pile: number;
  streak: Streak;

  // ---- results ----
  result: HandResult | null;
  /** Session scoreboard: hands won by each team in this match. */
  score: Record<Team, number>;
}

/** Every action the engine understands. All are validated before applying. */
export type GameAction =
  | { type: 'NEW_MATCH'; seed: number }
  | { type: 'FINISH_DEAL' }
  | { type: 'BID'; seat: Seat; value: number }
  | { type: 'PASS'; seat: Seat }
  | { type: 'CHOOSE_RANG'; seat: Seat; cardId: string }
  | { type: 'REVEAL_RANG'; seat: Seat }
  | { type: 'PLAY_CARD'; seat: Seat; cardId: string }
  | { type: 'NEXT_HAND'; seed: number }
  | { type: 'RESTART_HAND'; seed: number }
  | { type: 'RESTART_MATCH'; seed: number };

/** Result of applying an action: either a new state or an error (state untouched). */
export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string; state: GameState };

/**
 * What ONE seat is allowed to know. Bots receive only this, so they cannot
 * cheat by reading other hands or the hidden Rang.
 */
export interface PublicView {
  seat: Seat;
  phase: Phase;
  dealer: Seat;
  turn: Seat;
  hand: Card[];
  bids: BidEntry[];
  highestBid: { seat: Seat; value: number } | null;
  bidder: Seat | null;
  bid: number | null;
  /** Known only if revealed, or if `seat` is the bidder. */
  rangSuit: Suit | null;
  /** The face-down card: only the bidder sees it. */
  hiddenCard: Card | null;
  rangRevealed: boolean;
  currentTrick: CurrentTrick;
  completedTricks: TrickRecord[];
  tricksWon: Record<Team, number>;
  pile: number;
  streak: Streak;
  /** Cards each seat currently holds (count only). */
  handSizes: number[];
  /** Suits each seat has publicly shown they are out of (failed to follow). */
  voids: Suit[][];
}
