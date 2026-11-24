/**
 * engine.ts — the pure Rang game engine (no React, no timers, no randomness
 * except from the seed passed in an action).
 *
 * `applyAction(state, action)` validates an action and returns either
 * `{ ok: true, state: newState }` or `{ ok: false, error, state: oldState }`.
 * Illegal actions never modify the state. `gameReducer` wraps it for
 * React's useReducer.
 *
 * State machine (state.phase):
 *   DEAL_5 → BIDDING → CHOOSE_RANG → DEAL_REST → PLAYING → HAND_OVER
 *   (HAND_OVER → NEXT_HAND → DEAL_5 …)
 * The two DEAL phases exist so the UI can animate the deal; it dispatches
 * FINISH_DEAL when the animation ends.
 */
import { createDeck, mulberry32, shuffle } from './deck';
import {
  bidError,
  canFollowSuit,
  isSeat,
  ledSuit,
  legalCards,
  nextSeat,
  otherTeam,
  revealError,
  teamOf,
  trickWinner,
  TRICKS_PER_HAND,
} from './rules';
import {
  ALL_PASS_BIDDER_OFFSET,
  ALL_PASS_FORCED_BID,
  AUTO_REVEAL_FOR_BIDDER,
  FIRST_BIDDER_OFFSET,
  FIRST_DEAL_SIZE,
  FIRST_DEALER,
  LEFTOVER_PILE_OWNER,
  MAX_BID,
  MAX_BID_ENDS_BIDDING,
  RESET_STREAK_AFTER_COLLECTION,
  REVEAL_TRICK_USES_PILE,
  SECOND_DEAL_SIZE,
  STREAK_TO_COLLECT,
} from './rulesConfig';
import type {
  ActionResult,
  Card,
  GameAction,
  GameState,
  PublicView,
  Seat,
  Suit,
  Team,
  TrickOutcome,
  TrickRecord,
} from './types';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ok = (state: GameState): ActionResult => ({ ok: true, state });
const fail = (state: GameState, error: string): ActionResult => ({ ok: false, error, state });

/** Returns a copy of `hands` with `seat`'s hand replaced. */
const withHand = (hands: Card[][], seat: Seat, hand: Card[]): Card[][] =>
  hands.map((h, i) => (i === seat ? hand : h));

/** Picks the first dealer of a match from the seed (or the configured seat). */
function pickFirstDealer(seed: number): Seat {
  if (FIRST_DEALER !== 'random') return FIRST_DEALER;
  return Math.floor(mulberry32(seed ^ 0x9e3779b9)() * 4) as Seat;
}

// ---------------------------------------------------------------------------
// Creating matches and hands
// ---------------------------------------------------------------------------

interface HandSetup {
  seed: number;
  dealer: Seat;
  firstDealer: Seat;
  handNumber: number;
  score: Record<Team, number>;
}

/**
 * Shuffles a fresh deck with the seed and deals FIRST_DEAL_SIZE cards to each
 * player, one at a time, starting with the player to the dealer's left.
 * The remaining cards stay in `stock` until the Rang is chosen.
 */
function startHand({ seed, dealer, firstDealer, handNumber, score }: HandSetup): GameState {
  const deck = shuffle(createDeck(), mulberry32(seed));
  const hands: Card[][] = [[], [], [], []];
  let next = 0;
  for (let round = 0; round < FIRST_DEAL_SIZE; round++) {
    for (let k = 1; k <= 4; k++) hands[nextSeat(dealer, k)].push(deck[next++]);
  }
  return {
    phase: 'DEAL_5',
    handSeed: seed,
    handNumber,
    dealer,
    firstDealer,
    turn: nextSeat(dealer, FIRST_BIDDER_OFFSET),
    hands,
    stock: deck.slice(next),
    bids: [],
    highestBid: null,
    bidder: null,
    bid: null,
    forcedBid: false,
    hiddenCard: null,
    rangSuit: null,
    rangRevealed: false,
    revealedAtTrick: null,
    revealedBy: null,
    autoRevealed: false,
    currentTrick: { leader: dealer, plays: [] },
    revealedThisTrick: false,
    completedTricks: [],
    tricksWon: { A: 0, B: 0 },
    pile: 0,
    streak: { seat: null, count: 0 },
    result: null,
    score,
  };
}

/** A brand-new match: score 0–0, first dealer chosen from the seed. */
export function createMatch(seed: number, firstDealer: Seat = pickFirstDealer(seed)): GameState {
  return startHand({ seed, dealer: firstDealer, firstDealer, handNumber: 1, score: { A: 0, B: 0 } });
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

/** Ends the bidding round: sets the bidder (or forces one if all passed). */
function finishBidding(state: GameState): GameState {
  const forced = state.highestBid === null;
  const bidder = forced ? nextSeat(state.dealer, ALL_PASS_BIDDER_OFFSET) : state.highestBid!.seat;
  const bid = forced ? ALL_PASS_FORCED_BID : state.highestBid!.value;
  return { ...state, phase: 'CHOOSE_RANG', bidder, bid, forcedBid: forced, turn: bidder };
}

/** Records a bid or pass and moves on (or ends bidding after 4 calls / a max bid). */
function recordCall(state: GameState, seat: Seat, value: number | 'pass'): GameState {
  const bids = [...state.bids, { seat, value }];
  const highestBid = value === 'pass' ? state.highestBid : { seat, value };
  const after = { ...state, bids, highestBid, turn: nextSeat(seat) };
  const maxReached = value !== 'pass' && value === MAX_BID && MAX_BID_ENDS_BIDDING;
  return maxReached || bids.length === 4 ? finishBidding(after) : after;
}

// ---------------------------------------------------------------------------
// Choosing the Rang and the second deal
// ---------------------------------------------------------------------------

/**
 * The bidder puts one of their 5 cards face down — its suit is the Rang.
 * Then the remaining 32 cards are dealt (8 each, left of dealer first).
 */
function chooseRang(state: GameState, seat: Seat, cardId: string): ActionResult {
  if (state.phase !== 'CHOOSE_RANG') return fail(state, 'It is not time to choose the Rang.');
  if (seat !== state.bidder) return fail(state, 'Only the bidder chooses the Rang.');
  const card = state.hands[seat].find((c) => c.id === cardId);
  if (!card) return fail(state, 'That card is not in your hand.');

  const hands = withHand(state.hands, seat, state.hands[seat].filter((c) => c.id !== cardId)).map((h) => h.slice());
  let next = 0;
  for (let round = 0; round < SECOND_DEAL_SIZE; round++) {
    for (let k = 1; k <= 4; k++) hands[nextSeat(state.dealer, k)].push(state.stock[next++]);
  }
  return ok({
    ...state,
    phase: 'DEAL_REST',
    hands,
    stock: state.stock.slice(next),
    hiddenCard: card,
    rangSuit: card.suit,
    turn: seat,
  });
}

// ---------------------------------------------------------------------------
// Revealing the Rang
// ---------------------------------------------------------------------------

/** Turns the face-down card over: everyone now knows the Rang, and the card returns to the bidder's hand. */
function doReveal(state: GameState, seat: Seat, auto: boolean): GameState {
  const bidder = state.bidder!;
  return {
    ...state,
    hands: withHand(state.hands, bidder, [...state.hands[bidder], state.hiddenCard!]),
    hiddenCard: null,
    rangRevealed: true,
    revealedAtTrick: state.completedTricks.length + 1,
    revealedBy: seat,
    autoRevealed: auto,
    revealedThisTrick: true,
  };
}

/**
 * If it is now the bidder's turn and their only card left is the hidden
 * Rang card, reveal it automatically (configurable in rulesConfig).
 */
function applyAutoReveal(state: GameState): GameState {
  if (
    AUTO_REVEAL_FOR_BIDDER &&
    state.phase === 'PLAYING' &&
    !state.rangRevealed &&
    state.bidder !== null &&
    state.turn === state.bidder &&
    state.hands[state.bidder].length === 0 &&
    state.hiddenCard
  ) {
    return doReveal(state, state.bidder, true);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Trick play
// ---------------------------------------------------------------------------

/** Which team receives tricks still in the middle pile after trick 13. */
function leftoverOwner(state: GameState, lastWinner: Seat): Team {
  const biddingTeam = teamOf(state.bidder!);
  if (LEFTOVER_PILE_OWNER === 'biddingTeam') return biddingTeam;
  if (LEFTOVER_PILE_OWNER === 'defendingTeam') return otherTeam(biddingTeam);
  return teamOf(lastWinner);
}

/**
 * Judges a complete trick and decides where it goes:
 *  - Rang hidden → highest card of the led suit wins; trick goes to that team.
 *  - Rang revealed → trump rules; trick goes to the middle pile. When the same
 *    player wins STREAK_TO_COLLECT tricks in a row, their team collects the pile.
 *  - After trick 13 any leftover pile goes to LEFTOVER_PILE_OWNER.
 */
function resolveTrick(state: GameState): GameState {
  const { plays, leader } = state.currentTrick;
  const trumpActive = state.rangRevealed;
  const winner = trickWinner(plays, trumpActive ? state.rangSuit : null);
  const winTeam = teamOf(winner);
  const number = state.completedTricks.length + 1;
  const usesPile = trumpActive && (REVEAL_TRICK_USES_PILE || !state.revealedThisTrick);

  const tricksWon = { ...state.tricksWon };
  let pile = state.pile;
  let streak = state.streak;
  let outcome: TrickOutcome;

  if (!usesPile) {
    tricksWon[winTeam] += 1;
    outcome = { type: 'team', team: winTeam };
  } else {
    pile += 1;
    streak = streak.seat === winner ? { seat: winner, count: streak.count + 1 } : { seat: winner, count: 1 };
    if (streak.count >= STREAK_TO_COLLECT) {
      tricksWon[winTeam] += pile;
      outcome = { type: 'collected', team: winTeam, count: pile };
      pile = 0;
      if (RESET_STREAK_AFTER_COLLECTION) streak = { seat: null, count: 0 };
    } else {
      outcome = { type: 'pile', pileSize: pile };
    }
  }

  // Last trick: hand any remaining pile to its owner.
  if (number === TRICKS_PER_HAND && pile > 0) {
    const owner = leftoverOwner(state, winner);
    tricksWon[owner] += pile;
    outcome = { type: 'collected', team: owner, count: pile, leftover: true };
    pile = 0;
  }

  const record: TrickRecord = {
    number,
    leader,
    plays,
    winner,
    trumpActive,
    revealedHere: state.revealedThisTrick,
    outcome,
  };

  const next: GameState = {
    ...state,
    completedTricks: [...state.completedTricks, record],
    currentTrick: { leader: winner, plays: [] },
    revealedThisTrick: false,
    tricksWon,
    pile,
    streak,
    turn: winner,
  };
  return number === TRICKS_PER_HAND ? finishHand(next) : next;
}

/** Scores the hand: the bidding team wins if it collected at least its bid. */
function finishHand(state: GameState): GameState {
  const bidder = state.bidder!;
  const bid = state.bid!;
  const biddingTeam = teamOf(bidder);
  const winnerTeam = state.tricksWon[biddingTeam] >= bid ? biddingTeam : otherTeam(biddingTeam);
  const last = state.completedTricks[state.completedTricks.length - 1];
  const leftover =
    last?.outcome.type === 'collected' && last.outcome.leftover
      ? { team: last.outcome.team, count: last.outcome.count }
      : null;
  return {
    ...state,
    phase: 'HAND_OVER',
    score: { ...state.score, [winnerTeam]: state.score[winnerTeam] + 1 },
    result: {
      bidder,
      bid,
      biddingTeam,
      winnerTeam,
      rangSuit: state.rangSuit as Suit,
      revealedAtTrick: state.revealedAtTrick,
      revealedBy: state.revealedBy,
      tricksWon: { ...state.tricksWon },
      leftover,
      forcedBid: state.forcedBid,
    },
  };
}

/** Plays a card after checking turn, ownership and the follow-suit rule. */
function playCard(state: GameState, seat: Seat, cardId: string): ActionResult {
  if (state.phase !== 'PLAYING') return fail(state, 'Cards can only be played during trick play.');
  if (seat !== state.turn) return fail(state, 'Wait for your turn.');
  const hand = state.hands[seat];
  const card = hand.find((c) => c.id === cardId);
  if (!card) return fail(state, 'That card is not in your hand.');
  // Follow-suit rule: holding the led suit means you must play it.
  const led = ledSuit(state.currentTrick);
  if (led !== null && card.suit !== led && canFollowSuit(hand, state.currentTrick)) {
    return fail(state, 'You must follow the suit that was led.');
  }

  const afterPlay: GameState = {
    ...state,
    hands: withHand(state.hands, seat, hand.filter((c) => c.id !== cardId)),
    currentTrick: { ...state.currentTrick, plays: [...state.currentTrick.plays, { seat, card }] },
    turn: nextSeat(seat),
  };
  const resolved = afterPlay.currentTrick.plays.length === 4 ? resolveTrick(afterPlay) : afterPlay;
  return ok(applyAutoReveal(resolved));
}

// ---------------------------------------------------------------------------
// The public entry point
// ---------------------------------------------------------------------------

/**
 * Validates and applies one action. Never throws for bad input and never
 * mutates `state`; on error the original state is returned unchanged.
 */
export function applyAction(state: GameState, action: GameAction): ActionResult {
  if ('seat' in action && !isSeat(action.seat)) return fail(state, 'Unknown seat.');

  switch (action.type) {
    case 'NEW_MATCH':
      return ok(createMatch(action.seed));

    case 'RESTART_MATCH':
      return ok(createMatch(action.seed, state.firstDealer));

    case 'RESTART_HAND':
      if (state.phase === 'HAND_OVER') return fail(state, 'This hand is finished — start the next hand instead.');
      return ok(
        startHand({
          seed: action.seed,
          dealer: state.dealer,
          firstDealer: state.firstDealer,
          handNumber: state.handNumber,
          score: state.score,
        }),
      );

    case 'NEXT_HAND':
      if (state.phase !== 'HAND_OVER') return fail(state, 'Finish the current hand first.');
      return ok(
        startHand({
          seed: action.seed,
          dealer: nextSeat(state.dealer), // the deal rotates clockwise
          firstDealer: state.firstDealer,
          handNumber: state.handNumber + 1,
          score: state.score,
        }),
      );

    case 'FINISH_DEAL':
      if (state.phase === 'DEAL_5') return ok({ ...state, phase: 'BIDDING' });
      if (state.phase === 'DEAL_REST') {
        // The bidder leads the first trick.
        const bidder = state.bidder!;
        return ok(applyAutoReveal({ ...state, phase: 'PLAYING', turn: bidder, currentTrick: { leader: bidder, plays: [] } }));
      }
      return fail(state, 'There is no deal in progress.');

    case 'BID': {
      if (state.phase !== 'BIDDING') return fail(state, 'Bidding is not open.');
      if (action.seat !== state.turn) return fail(state, 'It is not your turn to bid.');
      const error = bidError(action.value, state.highestBid?.value ?? null);
      if (error) return fail(state, error);
      return ok(recordCall(state, action.seat, action.value));
    }

    case 'PASS':
      if (state.phase !== 'BIDDING') return fail(state, 'Bidding is not open.');
      if (action.seat !== state.turn) return fail(state, 'It is not your turn to bid.');
      return ok(recordCall(state, action.seat, 'pass'));

    case 'CHOOSE_RANG':
      return chooseRang(state, action.seat, action.cardId);

    case 'REVEAL_RANG': {
      const error = revealError(state, action.seat);
      if (error) return fail(state, error);
      return ok(doReveal(state, action.seat, false));
    }

    case 'PLAY_CARD':
      return playCard(state, action.seat, action.cardId);

    default:
      return fail(state, 'Unknown action.');
  }
}

/** useReducer-compatible wrapper: illegal actions simply leave the state as is. */
export function gameReducer(state: GameState, action: GameAction): GameState {
  return applyAction(state, action).state;
}

// ---------------------------------------------------------------------------
// Selectors (read-only helpers for the UI and bots)
// ---------------------------------------------------------------------------

/** Cards `seat` may legally play right now (empty if it is not their turn). */
export function getLegalCards(state: GameState, seat: Seat): Card[] {
  if (state.phase !== 'PLAYING' || state.turn !== seat) return [];
  return legalCards(state.hands[seat], state.currentTrick);
}

/** Suits each seat has publicly shown they lack (they did not follow suit). */
export function computeVoids(state: Pick<GameState, 'completedTricks' | 'currentTrick'>): Suit[][] {
  const voids: Suit[][] = [[], [], [], []];
  const tricks = [...state.completedTricks.map((t) => t.plays), state.currentTrick.plays];
  for (const plays of tricks) {
    const led = plays[0]?.card.suit;
    if (!led) continue;
    for (const p of plays.slice(1)) {
      if (p.card.suit !== led && !voids[p.seat].includes(led)) voids[p.seat].push(led);
    }
  }
  return voids;
}

/**
 * Everything `seat` is allowed to know. Bots only ever receive this view, so
 * they cannot see other hands, the undealt stock, or a hidden Rang that is
 * not theirs.
 */
export function getPublicView(state: GameState, seat: Seat): PublicView {
  const isBidder = state.bidder === seat;
  return {
    seat,
    phase: state.phase,
    dealer: state.dealer,
    turn: state.turn,
    hand: state.hands[seat].slice(),
    bids: state.bids,
    highestBid: state.highestBid,
    bidder: state.bidder,
    bid: state.bid,
    rangSuit: state.rangRevealed || isBidder ? state.rangSuit : null,
    hiddenCard: isBidder ? state.hiddenCard : null,
    rangRevealed: state.rangRevealed,
    currentTrick: state.currentTrick,
    completedTricks: state.completedTricks,
    tricksWon: state.tricksWon,
    pile: state.pile,
    streak: state.streak,
    handSizes: state.hands.map((h) => h.length),
    voids: computeVoids(state),
  };
}
