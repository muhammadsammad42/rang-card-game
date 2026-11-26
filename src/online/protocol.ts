/**
 * protocol.ts — pure functions that connect the game engine to online rooms.
 * No React and no Firebase, so every rule here is unit-tested.
 *
 *  - toPublicState: what the host publishes for everyone (no secrets).
 *  - handDocFor:    one player's private cards.
 *  - toGameAction:  turns a player's action request into an engine action.
 *  - toLocalView:   rebuilds a normal GameState from the public state + my hand,
 *                   rotated so I am always South (seat 0) and my partner North.
 *                   That lets the existing table components render online games.
 *  - seat helpers:  emptySeats, assignSeatRequests, replaceWithBot, restoreReturning.
 */
import { teamOf } from '@/game/rules';
import type { PlayerProfile } from '@/game/players';
import type { Card, GameAction, GameState, HandResult, Seat, Team, TrickOutcome, TrickRecord } from '@/game/types';

import type { ActionDoc, HandDoc, PlayerDoc, PublicState, RoomSeat } from './types';

export const SEAT_COUNT = 4;
const SEATS: Seat[] = [0, 1, 2, 3];

/** Removes `undefined` values (Firestore rejects them) by a JSON round trip. */
export const firestoreSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ---------------------------------------------------------------------------
// Publishing (host side)
// ---------------------------------------------------------------------------

/**
 * The public view of the game. Deliberately leaves out: every hand, the
 * undealt stock, the shuffle seed, and the hidden Rang card/suit until it
 * has been revealed.
 */
export function toPublicState(game: GameState, version: number, handId: number): PublicState {
  return firestoreSafe({
    version,
    handId,
    handNumber: game.handNumber,
    phase: game.phase,
    dealer: game.dealer,
    turn: game.turn,
    bids: game.bids,
    highestBid: game.highestBid,
    bidder: game.bidder,
    bid: game.bid,
    forcedBid: game.forcedBid,
    rangPlaced: game.rangCard !== null,
    rangRevealed: game.rangRevealed,
    rangSuit: game.rangRevealed ? game.rangSuit : null,
    rangCard: game.rangRevealed ? game.rangCard : null,
    revealedAtTrick: game.revealedAtTrick,
    revealedBy: game.revealedBy,
    autoRevealed: game.autoRevealed,
    currentTrick: game.currentTrick,
    completedTricks: game.completedTricks,
    tricksWon: game.tricksWon,
    pile: game.pile,
    streak: game.streak,
    result: game.result,
    score: game.score,
    handSizes: game.hands.map((h) => h.length),
  });
}

/** One seat's private hand document (the face-down card only for the bidder). */
export function handDocFor(game: GameState, seat: Seat, version: number, handId: number): HandDoc {
  const isBidder = game.bidder === seat;
  return firestoreSafe({
    version,
    handId,
    cards: game.hands[seat],
    hiddenCard: isBidder ? game.hiddenCard : null,
    rangSuit: isBidder ? game.rangSuit : null,
  });
}

/** Converts a player's request into an engine action for their seat (null if malformed). */
export function toGameAction(action: Pick<ActionDoc, 'type' | 'value' | 'cardId'>, seat: Seat): GameAction | null {
  switch (action.type) {
    case 'BID':
      return typeof action.value === 'number' ? { type: 'BID', seat, value: action.value } : null;
    case 'PASS':
      return { type: 'PASS', seat };
    case 'REVEAL_RANG':
      return { type: 'REVEAL_RANG', seat };
    case 'CHOOSE_RANG':
      return action.cardId ? { type: 'CHOOSE_RANG', seat, cardId: action.cardId } : null;
    case 'PLAY_CARD':
      return action.cardId ? { type: 'PLAY_CARD', seat, cardId: action.cardId } : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Seats (lobby)
// ---------------------------------------------------------------------------

export const ONLINE_BOT_NAMES = ['Noor', 'Bilal', 'Sana', 'Zara'];

export function emptySeat(index: number): RoomSeat {
  return { uid: null, name: '', isBot: false, team: teamOf(index as Seat), replacedUid: null, replacedName: null };
}

export const emptySeats = (): RoomSeat[] => SEATS.map(emptySeat);

export const botSeat = (index: number, replaced: { uid: string; name: string } | null = null): RoomSeat => ({
  uid: null,
  name: ONLINE_BOT_NAMES[index],
  isBot: true,
  team: teamOf(index as Seat),
  replacedUid: replaced?.uid ?? null,
  replacedName: replaced?.name ?? null,
});

export const isSeatOpen = (s: RoomSeat) => s.uid === null && !s.isBot;
export const seatOf = (seats: RoomSeat[], uid: string): Seat | null => {
  const i = seats.findIndex((s) => s.uid === uid && !s.isBot);
  return i < 0 ? null : (i as Seat);
};
export const allSeatsFilled = (seats: RoomSeat[]) => seats.every((s) => !isSeatOpen(s));
export const humanCount = (seats: RoomSeat[]) => seats.filter((s) => s.uid !== null && !s.isBot).length;

/**
 * Applies players' seat requests in the order they were made. Each request is
 * granted only if the seat is still open at that moment, so when two players
 * tap the same seat only the first one gets it (the host decides).
 */
export function assignSeatRequests(seats: RoomSeat[], players: PlayerDoc[]): RoomSeat[] {
  const next = seats.map((s) => ({ ...s }));
  for (const p of players) {
    if (p.wantsSeat === null || p.wantsSeat < 0 || p.wantsSeat >= SEAT_COUNT) continue;
    const current = seatOf(next, p.uid);
    if (current === p.wantsSeat) {
      next[current].name = p.name; // keep names fresh
      continue;
    }
    if (!isSeatOpen(next[p.wantsSeat])) continue;
    if (current !== null) next[current] = emptySeat(current);
    next[p.wantsSeat] = { ...emptySeat(p.wantsSeat), uid: p.uid, name: p.name };
  }
  return next;
}

/** Frees the seat of a player who left the lobby. */
export function vacate(seats: RoomSeat[], uid: string): RoomSeat[] {
  return seats.map((s, i) => (s.uid === uid ? emptySeat(i) : s));
}

/** Hands a human's seat to a bot (remembering who it was). */
export function replaceWithBot(seats: RoomSeat[], index: number): RoomSeat[] {
  const s = seats[index];
  return seats.map((x, i) => (i === index ? botSeat(i, s.uid ? { uid: s.uid, name: s.name } : null) : x));
}

/** At the start of a new hand, gives seats back to replaced players who have reconnected. */
export function restoreReturning(seats: RoomSeat[], connected: (uid: string) => boolean): RoomSeat[] {
  return seats.map((s, i) =>
    s.isBot && s.replacedUid && connected(s.replacedUid)
      ? { ...emptySeat(i), uid: s.replacedUid, name: s.replacedName ?? 'Player' }
      : s,
  );
}

/**
 * Presence: seats whose human has shown no heartbeat change for `timeoutMs`.
 * `lastChange` maps uid → local time (ms) when we last saw their heartbeat change.
 */
export function staleSeats(seats: RoomSeat[], lastChange: Record<string, number>, now: number, timeoutMs: number, exceptUid: string): number[] {
  return seats.flatMap((s, i) => {
    if (s.isBot || !s.uid || s.uid === exceptUid) return [];
    const seen = lastChange[s.uid];
    return seen === undefined || now - seen > timeoutMs ? [i] : [];
  });
}

// ---------------------------------------------------------------------------
// Rendering (every client): rotate so the local player is South
// ---------------------------------------------------------------------------

const HUMAN_AVATARS = ['🎩', '🦁', '🐼', '🐙'];
const BOT_AVATARS = ['🦉', '🐯', '🦊', '🐺'];
const SEAT_COLORS: [string, string][] = [
  ['#D9B65D', '#8A6A22'],
  ['#7A4FD1', '#3B2378'],
  ['#2F9E8F', '#14524A'],
  ['#D9733F', '#7A3316'],
];

/** A placeholder card for hands we can't see (only the count is ever shown). */
const hiddenPlaceholder = (i: number): Card => ({ id: `hidden-${i}`, suit: 'S', rank: 2 });

export interface LocalView {
  game: GameState;
  players: PlayerProfile[];
  /** view seat → real (room) seat */
  realSeat: (view: Seat) => Seat;
  /** real (room) seat → view seat */
  viewSeat: (real: Seat) => Seat;
}

/**
 * Builds the local player's view: a complete GameState (as the single-player
 * screens expect) with seats rotated so the local player is seat 0 and their
 * team is always "A" ("Us"). Spectators (mySeat null) watch from seat 0's view.
 */
export function toLocalView(pub: PublicState, hand: HandDoc | null, mySeat: Seat | null, seats: RoomSeat[], myName: string): LocalView {
  const me = mySeat ?? 0;
  const view = (real: Seat): Seat => (((real - me + 4) % 4) as Seat);
  const real = (v: Seat): Seat => (((v + me) % 4) as Seat);
  const viewOrNull = (s: Seat | null): Seat | null => (s === null ? null : view(s));
  // My team becomes "A" in the view.
  const swap = teamOf(me) === 'B';
  const t = (team: Team): Team => (swap ? (team === 'A' ? 'B' : 'A') : team);
  const tt = (r: Record<Team, number>): Record<Team, number> => (swap ? { A: r.B, B: r.A } : { ...r });

  const outcome = (o: TrickOutcome): TrickOutcome =>
    o.type === 'pile' ? o : o.type === 'team' ? { ...o, team: t(o.team) } : { ...o, team: t(o.team) };
  const trick = (x: TrickRecord): TrickRecord => ({
    ...x,
    leader: view(x.leader),
    winner: view(x.winner),
    plays: x.plays.map((p) => ({ ...p, seat: view(p.seat) })),
    outcome: outcome(x.outcome),
  });
  const result: HandResult | null = pub.result
    ? {
        ...pub.result,
        bidder: view(pub.result.bidder),
        revealedBy: viewOrNull(pub.result.revealedBy),
        biddingTeam: t(pub.result.biddingTeam),
        winnerTeam: t(pub.result.winnerTeam),
        tricksWon: tt(pub.result.tricksWon),
        leftover: pub.result.leftover ? { ...pub.result.leftover, team: t(pub.result.leftover.team) } : null,
      }
    : null;

  const iAmBidder = mySeat !== null && pub.bidder === mySeat;
  const myHiddenCard = iAmBidder ? (hand?.hiddenCard ?? null) : null;
  // Everyone sees that a face-down card exists; only the bidder (or everyone after the reveal) knows which.
  const rangCard = pub.rangRevealed ? pub.rangCard : pub.rangPlaced ? (myHiddenCard ?? hiddenPlaceholder(99)) : null;
  const hiddenCard = pub.rangPlaced && !pub.rangRevealed ? (myHiddenCard ?? hiddenPlaceholder(98)) : null;

  const hands: Card[][] = SEATS.map((v) => {
    const r = real(v);
    // My own seat: my real cards, or nothing yet (never placeholders — the hand is drawn face up).
    if (v === 0) return mySeat !== null && hand && hand.handId === pub.handId ? hand.cards : [];
    return Array.from({ length: pub.handSizes[r] ?? 0 }, (_, i) => hiddenPlaceholder(i));
  });

  const game: GameState = {
    phase: pub.phase,
    handSeed: pub.handId,
    handNumber: pub.handNumber,
    dealer: view(pub.dealer),
    firstDealer: view(pub.dealer),
    turn: view(pub.turn),
    hands,
    stock: [],
    bids: pub.bids.map((b) => ({ ...b, seat: view(b.seat) })),
    highestBid: pub.highestBid ? { ...pub.highestBid, seat: view(pub.highestBid.seat) } : null,
    bidder: viewOrNull(pub.bidder),
    bid: pub.bid,
    forcedBid: pub.forcedBid,
    hiddenCard,
    rangCard,
    rangSuit: pub.rangRevealed ? pub.rangSuit : iAmBidder ? (hand?.rangSuit ?? null) : null,
    rangRevealed: pub.rangRevealed,
    revealedAtTrick: pub.revealedAtTrick,
    revealedBy: viewOrNull(pub.revealedBy),
    autoRevealed: pub.autoRevealed,
    currentTrick: { leader: view(pub.currentTrick.leader), plays: pub.currentTrick.plays.map((p) => ({ ...p, seat: view(p.seat) })) },
    revealedThisTrick: false,
    completedTricks: pub.completedTricks.map(trick),
    tricksWon: tt(pub.tricksWon),
    pile: pub.pile,
    streak: { seat: viewOrNull(pub.streak.seat), count: pub.streak.count },
    result,
    score: tt(pub.score),
  };

  const players: PlayerProfile[] = SEATS.map((v) => {
    const r = real(v);
    const s = seats[r];
    const isMe = v === 0 && mySeat !== null;
    return {
      seat: v,
      name: isMe ? myName : s?.name || (s?.isBot ? ONLINE_BOT_NAMES[r] : 'Empty'),
      avatar: s?.isBot ? BOT_AVATARS[r] : HUMAN_AVATARS[r],
      colors: SEAT_COLORS[r],
      isBot: !!s?.isBot,
    };
  });

  return { game, players, realSeat: real, viewSeat: view };
}
