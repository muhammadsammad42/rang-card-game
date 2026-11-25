/**
 * ai.ts — the three computer players.
 *
 * Bots receive ONLY a PublicView (see engine.getPublicView): their own hand,
 * the bids, every card already played, and the Rang suit only if it has been
 * revealed or they are the bidder. They cannot see other hands, so they
 * cannot cheat.
 *
 * Two levels:
 *  - easy:   random legal moves and very simple bids.
 *  - normal: heuristics (hand evaluation, cheap wins, never overtaking a
 *            winning partner, keeping the Rang hidden, forcing reveals,
 *            and tracking which cards — including Rang cards — are gone).
 */
import { rankLabel } from './deck';
import { beats, canFollowSuit, legalCards, partnerOf, teamOf, trickWinner } from './rules';
import { MAX_BID, MIN_BID, PARTNER_MAY_REVEAL } from './rulesConfig';
import type { Card, GameAction, PublicView, Rank, Seat, Suit } from './types';

export type BotLevel = 'easy' | 'normal';
type Rng = () => number;

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const byRankAsc = (a: Card, b: Card) => a.rank - b.rank;
const lowest = (cards: Card[]) => cards.slice().sort(byRankAsc)[0];
const highest = (cards: Card[]) => cards.slice().sort(byRankAsc)[cards.length - 1];
const randomOf = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

/**
 * Chooses the bot's next action. Returns null if it is not this bot's turn
 * or there is nothing to decide (e.g. during a deal).
 */
export function decideBotAction(view: PublicView, level: BotLevel, rng: Rng = Math.random): GameAction | null {
  if (view.turn !== view.seat) return null;
  switch (view.phase) {
    case 'BIDDING':
      return decideBid(view, level, rng);
    case 'CHOOSE_RANG':
      return { type: 'CHOOSE_RANG', seat: view.seat, cardId: chooseRangCard(view.hand, level, rng).id };
    case 'PLAYING':
      return decidePlay(view, level, rng);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

/** High-card points: A = 4, K = 3, Q = 2, J = 1. */
const HCP: Partial<Record<number, number>> = { 14: 4, 13: 3, 12: 2, 11: 1 };

/**
 * Looks at the 5 bidding cards and returns the highest bid this hand
 * supports, or null to pass. Bids 8 only with real strength (e.g. two high
 * cards in one suit) and goes higher rarely, only with very strong hands.
 */
export function evaluateHand(hand: Card[]): number | null {
  const points = hand.reduce((sum, c) => sum + (HCP[c.rank] ?? 0), 0);
  const count = (s: Suit) => hand.filter((c) => c.suit === s).length;
  const highIn = (s: Suit) => hand.filter((c) => c.suit === s && c.rank >= 12).length;
  const best = SUITS.slice().sort((a, b) => count(b) - count(a) || highIn(b) - highIn(a))[0];
  const longest = count(best);
  const strongSuit = SUITS.some((s) => highIn(s) >= 2);

  let bid: number | null = null;
  if (strongSuit && points >= 7) bid = 8;
  else if (longest >= 3 && highIn(best) >= 1 && points >= 6) bid = 8;
  if (bid === null) return null;
  if (points >= 11 && longest >= 3) bid = 9;
  if (points >= 13 && longest >= 4) bid = 10;
  if (points >= 15 && longest >= 4 && highIn(best) >= 3) bid = 11;
  return Math.min(bid, MAX_BID);
}

function decideBid(view: PublicView, level: BotLevel, rng: Rng): GameAction {
  const seat = view.seat;
  const minimum = view.highestBid ? view.highestBid.value + 1 : MIN_BID;
  const pass: GameAction = { type: 'PASS', seat };
  if (minimum > MAX_BID) return pass;

  if (level === 'easy') {
    const aces = view.hand.filter((c) => c.rank >= 13).length;
    if ((aces >= 2 && minimum <= 9) || (minimum === MIN_BID && rng() < 0.15)) return { type: 'BID', seat, value: minimum };
    return pass;
  }

  // Never outbid your own partner.
  if (view.highestBid && view.highestBid.seat === partnerOf(seat)) return pass;
  const desired = evaluateHand(view.hand);
  return desired !== null && desired >= minimum ? { type: 'BID', seat, value: minimum } : pass;
}

/**
 * The Rang is the suit the bidder holds most cards in (tie-break: higher
 * cards). The LOWEST card of that suit goes face down, keeping the high
 * cards in hand for play.
 */
export function chooseRangCard(hand: Card[], level: BotLevel, rng: Rng = Math.random): Card {
  if (level === 'easy') return randomOf(hand, rng);
  const inSuit = (s: Suit) => hand.filter((c) => c.suit === s);
  const strength = (s: Suit) => inSuit(s).reduce((sum, c) => sum + c.rank, 0);
  const suit = SUITS.filter((s) => inSuit(s).length > 0).sort(
    (a, b) => inSuit(b).length - inSuit(a).length || strength(b) - strength(a),
  )[0];
  return lowest(inSuit(suit));
}

// ---------------------------------------------------------------------------
// Trick play
// ---------------------------------------------------------------------------

/** Mirrors rules.revealError, using only public information. */
function mayReveal(view: PublicView): boolean {
  if (view.phase !== 'PLAYING' || view.rangRevealed || view.turn !== view.seat || view.bidder === null) return false;
  if (view.seat === view.bidder) return true;
  if (!PARTNER_MAY_REVEAL && teamOf(view.seat) === teamOf(view.bidder)) return false;
  return view.currentTrick.plays.length > 0 && !canFollowSuit(view.hand, view.currentTrick);
}

/** All cards seen so far this hand (completed tricks + the current trick). */
function seenCards(view: PublicView): Set<string> {
  const ids = new Set<string>();
  for (const t of view.completedTricks) for (const p of t.plays) ids.add(p.card.id);
  for (const p of view.currentTrick.plays) ids.add(p.card.id);
  return ids;
}

function decidePlay(view: PublicView, level: BotLevel, rng: Rng): GameAction {
  const me = view.seat;
  const play = (card: Card): GameAction => ({ type: 'PLAY_CARD', seat: me, cardId: card.id });
  const reveal: GameAction = { type: 'REVEAL_RANG', seat: me };

  // Only the face-down Rang card left (when auto-reveal is turned off).
  if (view.hand.length === 0) return reveal;

  const legal = legalCards(view.hand, view.currentTrick);
  const canReveal = mayReveal(view);

  if (level === 'easy') {
    if (canReveal && rng() < 0.25) return reveal;
    return play(randomOf(legal, rng));
  }

  const choice = normalPlay(view, legal, canReveal);
  if (choice === 'reveal') return reveal;
  // Safety net: never return an illegal card.
  return play(legal.some((c) => c.id === choice.id) ? choice : legal[0]);
}

/** The "normal" strategy. Returns a card to play or 'reveal'. */
function normalPlay(view: PublicView, legal: Card[], canReveal: boolean): Card | 'reveal' {
  const me = view.seat;
  const hand = view.hand;
  const bidder = view.bidder as Seat;
  const onBiddingTeam = teamOf(me) === teamOf(bidder);
  const knownTrump = view.rangSuit; // known if revealed, or if I am the bidder
  const activeTrump = view.rangRevealed ? view.rangSuit : null; // what actually judges the trick
  const seen = seenCards(view);
  const plays = view.currentTrick.plays;

  /**
   * A card is a "master" if every higher card of its suit has been played or
   * is in my own hand — so nobody can beat it by following suit. After the
   * reveal, this also tracks which Rang cards are gone.
   */
  const isMaster = (card: Card) => {
    for (let r = card.rank + 1; r <= 14; r++) {
      const id = `${rankLabel(r as Rank)}${card.suit}`;
      const accountedFor = hand.some((c) => c.id === id) || seen.has(id) || view.hiddenCard?.id === id;
      if (!accountedFor) return false;
    }
    return true;
  };
  /** How many cards of `suit` are still unseen in other players' hands. */
  const outstanding = (suit: Suit) => {
    let n = 13 - hand.filter((c) => c.suit === suit).length;
    for (const id of seen) if (id.endsWith(suit)) n--;
    if (view.hiddenCard?.suit === suit) n--;
    return n;
  };
  const suitLength = (suit: Suit) => hand.filter((c) => c.suit === suit).length;
  const nonTrump = (cards: Card[]) => cards.filter((c) => c.suit !== knownTrump);

  /** Throw away the least useful card: no masters, short non-trump suits, low ranks first. */
  const discard = (cards: Card[]): Card => {
    const pool = nonTrump(cards).length > 0 ? nonTrump(cards) : cards;
    return pool
      .slice()
      .sort(
        (a, b) =>
          Number(isMaster(a)) - Number(isMaster(b)) || suitLength(a.suit) - suitLength(b.suit) || a.rank - b.rank,
      )[0];
  };

  // ----- Leading a trick -----
  if (plays.length === 0) {
    // Bidding team after the reveal: draw out the remaining Rang cards with a master trump.
    if (view.rangRevealed && onBiddingTeam && knownTrump) {
      const trumps = hand.filter((c) => c.suit === knownTrump);
      if (trumps.length >= 2 && outstanding(knownTrump) > 0 && isMaster(highest(trumps))) return highest(trumps);
    }
    // Cash a non-trump master card (it should win the trick).
    const masters = nonTrump(hand).filter(isMaster);
    if (masters.length > 0) return highest(masters);
    // Defenders, while the Rang is hidden: lead a suit the bidder is out of,
    // so the bidder must reveal the Rang or throw a card away.
    if (!view.rangRevealed && !onBiddingTeam) {
      const target = hand.filter((c) => view.voids[bidder].includes(c.suit));
      if (target.length > 0) return lowest(target);
    }
    // Otherwise lead low from my longest non-trump suit.
    const pool = nonTrump(hand).length > 0 ? nonTrump(hand) : hand;
    const longSuit = SUITS.filter((s) => pool.some((c) => c.suit === s)).sort((a, b) => suitLength(b) - suitLength(a))[0];
    return lowest(pool.filter((c) => c.suit === longSuit));
  }

  // ----- Following -----
  const bestSeat = trickWinner(plays, activeTrump);
  const best = plays.find((p) => p.seat === bestSeat)!.card;
  const partnerWinning = bestSeat === partnerOf(me);
  const lastToPlay = plays.length === 3;
  const led = plays[0].card.suit;

  if (hand.some((c) => c.suit === led)) {
    // Must follow suit.
    if (partnerWinning) return lowest(legal); // don't overtake the partner
    const winners = legal.filter((c) => beats(c, best, activeTrump));
    if (winners.length === 0) return lowest(legal);
    if (lastToPlay) return lowest(winners); // win as cheaply as possible
    const masterWinners = winners.filter(isMaster);
    return masterWinners.length > 0 ? lowest(masterWinners) : lowest(winners);
  }

  // Void in the led suit.
  const opponentsWinning = teamOf(bestSeat) !== teamOf(me);
  if (!view.rangRevealed) {
    if (canReveal) {
      // The bidder keeps the Rang hidden unless revealing wins a trick the opponents would take.
      if (me === bidder && opponentsWinning && knownTrump && (suitLength(knownTrump) > 0 || view.hiddenCard)) return 'reveal';
      // Defenders reveal to stop the bidding team from winning the trick.
      if (!onBiddingTeam && opponentsWinning) return 'reveal';
    }
    return discard(legal);
  }

  // Rang revealed: trump in if it helps.
  const trump = activeTrump as Suit;
  const partnerSafe = partnerWinning && (lastToPlay || best.suit === trump || isMaster(best));
  if (partnerSafe) return discard(legal);
  const winningTrumps = legal.filter((c) => c.suit === trump && beats(c, best, trump));
  if (winningTrumps.length > 0) return lowest(winningTrumps);
  return discard(legal);
}
