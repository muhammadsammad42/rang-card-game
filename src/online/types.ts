/**
 * types.ts — the Firestore documents of an online room.
 *
 *   rooms/{code}                 RoomDoc     written only by the host
 *   rooms/{code}/players/{uid}   PlayerDoc   written only by that player (presence + seat request)
 *   rooms/{code}/hands/{uid}     HandDoc     written by the host, readable only by that player
 *   rooms/{code}/actions/{id}    ActionDoc   created by a player, resolved by the host
 *
 * Nothing secret (other players' cards, the hidden Rang, the shuffle seed) is
 * ever stored in RoomDoc — see protocol.toPublicState.
 */
import type {
  BidEntry,
  Card,
  CurrentTrick,
  HandResult,
  Phase,
  Seat,
  Streak,
  Suit,
  Team,
  TrickRecord,
} from '@/game/types';

export type RoomStatus = 'lobby' | 'playing' | 'handOver' | 'closed';

export interface RoomSeat {
  /** The human sitting here (Firebase uid), or null for an empty seat / bot. */
  uid: string | null;
  name: string;
  isBot: boolean;
  team: Team;
  /** When a disconnected player was replaced by a bot: who it was (so they can come back). */
  replacedUid: string | null;
  replacedName: string | null;
}

/** Everything every player may see. Mirrors GameState minus the secrets. */
export interface PublicState {
  /** Increases with every published change; clients send it with each action (stale check). */
  version: number;
  /** Random id per hand (NOT the shuffle seed, which would reveal every hand). */
  handId: number;
  handNumber: number;
  phase: Phase;
  dealer: Seat;
  turn: Seat;
  bids: BidEntry[];
  highestBid: { seat: Seat; value: number } | null;
  bidder: Seat | null;
  bid: number | null;
  forcedBid: boolean;
  /** Has the bidder placed the face-down card yet? */
  rangPlaced: boolean;
  rangRevealed: boolean;
  /** Only set after the reveal. */
  rangSuit: Suit | null;
  /** Only set after the reveal. */
  rangCard: Card | null;
  revealedAtTrick: number | null;
  revealedBy: Seat | null;
  autoRevealed: boolean;
  currentTrick: CurrentTrick;
  completedTricks: TrickRecord[];
  tricksWon: Record<Team, number>;
  pile: number;
  streak: Streak;
  result: HandResult | null;
  score: Record<Team, number>;
  /** Cards in each seat's hand (the face-down Rang card is not counted). */
  handSizes: number[];
}

export interface Notice {
  id: number;
  text: string;
}

export interface RoomDoc {
  code: string;
  hostUid: string;
  hostName: string;
  status: RoomStatus;
  seats: RoomSeat[];
  publicState: PublicState | null;
  /** Latest announcement for everyone (e.g. "Ali disconnected — a bot took over"). */
  notice: Notice | null;
  closedReason: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PlayerDoc {
  uid: string;
  name: string;
  /** Seat this player asked for (the host decides). */
  wantsSeat: number | null;
  /** Bumped on every heartbeat (~10 s). Watched for *changes*, so device clocks don't matter. */
  heartbeat: number;
  joinedAt?: unknown;
  lastSeen?: unknown;
}

/** One player's private cards. */
export interface HandDoc {
  version: number;
  handId: number;
  cards: Card[];
  /** Only for the bidder, while the Rang is still face down. */
  hiddenCard: Card | null;
  /** Only for the bidder (the suit they chose). */
  rangSuit: Suit | null;
}

export type ActionType = 'BID' | 'PASS' | 'CHOOSE_RANG' | 'REVEAL_RANG' | 'PLAY_CARD';
export type ActionStatus = 'pending' | 'applied' | 'rejected';

/** A move requested by a player; the host validates it with the engine. */
export interface ActionDoc {
  uid: string;
  type: ActionType;
  value: number | null;
  cardId: string | null;
  /** PublicState.version the player was looking at when they acted. */
  version: number;
  status: ActionStatus;
  reason: string | null;
  createdAt?: unknown;
}
