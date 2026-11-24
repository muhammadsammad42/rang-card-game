/**
 * deck.ts — the 52-card deck, a seeded random number generator, the
 * Fisher–Yates shuffle, and small card helpers (labels, sorting).
 *
 * Seeding the RNG makes every deal reproducible, which is what lets the unit
 * tests (and a "restart this exact hand" feature) work deterministically.
 */
import type { Card, Rank, Suit } from './types';

export const SUITS: readonly Suit[] = ['S', 'H', 'C', 'D'];
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const RANK_LABELS: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};
const RANK_NAMES: Record<Rank, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};
export const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAMES: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

export const rankLabel = (rank: Rank): string => RANK_LABELS[rank];
export const isRedSuit = (suit: Suit): boolean => suit === 'H' || suit === 'D';

/** Builds a card object with its stable id, e.g. makeCard('H', 10) → "10H". */
export function makeCard(suit: Suit, rank: Rank): Card {
  return { id: `${RANK_LABELS[rank]}${suit}`, suit, rank };
}

/** Parses an id like "QS" back into a card (used by tests and logs). */
export function cardFromId(id: string): Card {
  const suit = id.slice(-1) as Suit;
  const label = id.slice(0, -1);
  const rank = (Object.keys(RANK_LABELS) as unknown as string[])
    .map(Number)
    .find((r) => RANK_LABELS[r as Rank] === label) as Rank | undefined;
  if (!rank || !SUITS.includes(suit)) throw new Error(`Bad card id: ${id}`);
  return makeCard(suit, rank);
}

/** Human-readable name for accessibility labels: "Ace of Spades". */
export const cardName = (card: Card): string => `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;

/** Short label for logs/UI: "A♠". */
export const cardShort = (card: Card): string => `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;

/** A fresh, ordered 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(suit, rank));
  return deck;
}

/**
 * mulberry32 — a tiny, fast, seeded pseudo-random generator.
 * Returns a function producing floats in [0, 1). Same seed → same sequence.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates shuffle: walk the array from the end, swapping each position
 * with a random earlier (or same) position. Every permutation is equally
 * likely. Returns a NEW array; the input is not modified.
 */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A random 32-bit seed for a new hand (the only impure helper; not used by the engine). */
export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff);

/**
 * Sorts a hand for display: grouped by suit (alternating colours ♠ ♥ ♣ ♦),
 * high cards first within each suit.
 */
export function sortHand(cards: readonly Card[]): Card[] {
  return cards
    .slice()
    .sort((a, b) => (a.suit === b.suit ? b.rank - a.rank : SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)));
}
