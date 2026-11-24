/**
 * helpers.ts — test utilities: build hand-crafted game states so each rule
 * can be tested in isolation, and drive a whole hand with random legal moves.
 */
import { cardFromId, mulberry32 } from '../deck';
import { applyAction, getLegalCards } from '../engine';
import { revealError } from '../rules';
import type { GameAction, GameState, Seat, Suit, Team, TrickRecord } from '../types';

interface FixtureOptions {
  /** Card ids per seat, e.g. [['AH','2S'], ...]. */
  hands: string[][];
  bidder?: Seat;
  bid?: number;
  rangSuit?: Suit;
  revealed?: boolean;
  /** Face-down card id (only when not revealed). */
  hidden?: string;
  /** Whose turn / who leads the current trick. */
  leader: Seat;
  /** How many tricks were already completed (dummy records). */
  completed?: number;
  tricksWon?: Record<Team, number>;
  pile?: number;
}

/** Builds a PLAYING-phase state with exactly the cards we want. */
export function playingFixture(o: FixtureOptions): GameState {
  const completed = o.completed ?? 0;
  const dummy: TrickRecord[] = Array.from({ length: completed }, (_, i) => ({
    number: i + 1,
    leader: 0,
    plays: [],
    winner: 0,
    trumpActive: false,
    revealedHere: false,
    outcome: { type: 'team', team: 'A' },
  }));
  return {
    phase: 'PLAYING',
    handSeed: 1,
    handNumber: 1,
    dealer: 3,
    firstDealer: 3,
    turn: o.leader,
    hands: o.hands.map((h) => h.map(cardFromId)),
    stock: [],
    bids: [],
    highestBid: null,
    bidder: o.bidder ?? 0,
    bid: o.bid ?? 8,
    forcedBid: false,
    hiddenCard: o.hidden ? cardFromId(o.hidden) : null,
    rangSuit: o.rangSuit ?? 'S',
    rangRevealed: o.revealed ?? false,
    revealedAtTrick: o.revealed ? 1 : null,
    revealedBy: o.revealed ? (o.bidder ?? 0) : null,
    autoRevealed: false,
    currentTrick: { leader: o.leader, plays: [] },
    revealedThisTrick: false,
    completedTricks: dummy,
    tricksWon: o.tricksWon ?? { A: 0, B: 0 },
    pile: o.pile ?? 0,
    streak: { seat: null, count: 0 },
    result: null,
    score: { A: 0, B: 0 },
  };
}

/** Applies actions in order, failing the test loudly if any is rejected. */
export function run(state: GameState, actions: GameAction[]): GameState {
  return actions.reduce((s, a) => {
    const res = applyAction(s, a);
    if (!res.ok) throw new Error(`Action ${JSON.stringify(a)} rejected: ${res.error}`);
    return res.state;
  }, state);
}

/** Plays the given card ids in turn order starting with whoever's turn it is. */
export function playTrick(state: GameState, cardIds: string[]): GameState {
  let s = state;
  for (const id of cardIds) s = run(s, [{ type: 'PLAY_CARD', seat: s.turn, cardId: id }]);
  return s;
}

/** Plays an entire hand with random (but legal) choices. Returns the final state. */
export function playRandomHand(start: GameState, seed: number): GameState {
  const rng = mulberry32(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rng() * xs.length)];
  let s = start;
  for (let guard = 0; guard < 500 && s.phase !== 'HAND_OVER'; guard++) {
    const seat = s.turn;
    let action: GameAction;
    switch (s.phase) {
      case 'DEAL_5':
      case 'DEAL_REST':
        action = { type: 'FINISH_DEAL' };
        break;
      case 'BIDDING': {
        const min = (s.highestBid?.value ?? 7) + 1;
        action = rng() < 0.5 || min > 13 ? { type: 'PASS', seat } : { type: 'BID', seat, value: min + Math.floor(rng() * (14 - min)) };
        break;
      }
      case 'CHOOSE_RANG':
        action = { type: 'CHOOSE_RANG', seat, cardId: pick(s.hands[seat]).id };
        break;
      default:
        if (revealError(s, seat) === null && rng() < 0.3) action = { type: 'REVEAL_RANG', seat };
        else action = { type: 'PLAY_CARD', seat, cardId: pick(getLegalCards(s, seat)).id };
    }
    s = run(s, [action]);
  }
  return s;
}
