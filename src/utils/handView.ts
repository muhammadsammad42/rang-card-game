/**
 * handView.ts — pure helpers that turn engine data into what the hand UI draws.
 *
 * The highlighting pipeline (explained in docs/PROJECT_GUIDE.md §13):
 *
 *   engine: getLegalCards(state, seat)          (rules.legalCards → follow-suit rule)
 *        → legalIds: Set<string>                (GameProvider / OnlineRoomProvider)
 *        → buildHandView(cards, legalIds, myTurn)
 *        → one { card, isPlayable, state } per card   ← this file
 *        → <HandCard> picks its style/animation from `state`
 *
 * Nothing here decides legality itself — the engine stays the single source
 * of truth. These functions only sort, label and lay out the cards.
 */
import { SUIT_NAMES, SUIT_SYMBOLS, SUITS, sortHand } from '@/game/deck';
import { ledSuit } from '@/game/rules';
import type { Card, CurrentTrick, Suit } from '@/game/types';
import { CARD_RATIO } from '@/hooks/useLayout';

export type HandSort = 'suit' | 'rank';

/**
 * - 'playable': my turn and the engine says this card is legal → glow + lift.
 * - 'blocked':  my turn but the card is illegal (must follow suit) → dimmed, lowered, not playable.
 * - 'idle':     not my turn (or not the playing phase) → neutral, non-interactive.
 */
export type HandCardState = 'playable' | 'blocked' | 'idle';

export interface HandCardView {
  card: Card;
  isPlayable: boolean;
  state: HandCardState;
}

/**
 * Display order. 'suit': grouped ♠ ♥ ♣ ♦ (alternating black/red), high → low
 * inside each suit. 'rank': A → 2, ties in the same alternating suit order.
 */
export function sortForDisplay(cards: readonly Card[], mode: HandSort): Card[] {
  if (mode === 'suit') return sortHand(cards);
  return cards.slice().sort((a, b) => (a.rank === b.rank ? SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) : b.rank - a.rank));
}

/** Attaches the `isPlayable` flag (from the engine's legal ids) and a visual state to every card. */
export function buildHandView(cards: readonly Card[], legalIds: ReadonlySet<string>, myTurnToPlay: boolean): HandCardView[] {
  return cards.map((card) => {
    const isPlayable = myTurnToPlay && legalIds.has(card.id);
    return { card, isPlayable, state: !myTurnToPlay ? 'idle' : isPlayable ? 'playable' : 'blocked' };
  });
}

/**
 * "♦ Diamonds" for status text. The U+FE0E selector asks Android for the TEXT
 * glyph (coloured like the text) instead of the emoji, so ♣/♠ never render as
 * black emoji that would vanish on the dark status bar.
 */
export const suitText = (suit: Suit): string => `${SUIT_SYMBOLS[suit]}︎ ${SUIT_NAMES[suit]}`;

/** "You must follow ♦ Diamonds" — shown when an illegal card is tapped. */
export function illegalMessage(trick: CurrentTrick): string {
  const led = ledSuit(trick);
  return led ? `You must follow ${suitText(led)}` : 'That card cannot be played now';
}

/** Screen-reader label: "Eight of Diamonds, playable". */
export function cardA11yLabel(name: string, state: HandCardState, selected: boolean): string {
  const status = state === 'playable' ? ', playable' : state === 'blocked' ? ', not playable — must follow suit' : '';
  return `${name}${status}${selected ? ', selected' : ''}`;
}

// ---------------------------------------------------------------------------
// Fan geometry
// ---------------------------------------------------------------------------

/** Minimum visible slice of each overlapped card, as a fraction of its width (keeps rank + suit corner readable). */
export const CORNER_FRACTION = 0.34;

export interface FanSlot {
  x: number;
  y: number;
  rotate: number;
}

export interface FanLayout {
  cardWidth: number;
  cardHeight: number;
  /** Horizontal distance between neighbouring cards. */
  step: number;
  /** Height the hand container needs (room for the lift of selected/playable cards included). */
  height: number;
  slots: FanSlot[];
}

/**
 * Lays out `count` cards in a gentle arc that ALWAYS fits inside `width`:
 * the rotated outer edges of the first and last card stay on screen, and each
 * card shows at least CORNER_FRACTION of its width so its corner index is
 * readable. If 13 cards would not fit at `maxCardWidth`, the cards shrink.
 */
export function fanLayout(count: number, width: number, maxCardWidth: number, pad = 6): FanLayout {
  const n = Math.max(1, count);
  const maxRot = n > 1 ? Math.min(9, 2 + n * 0.55) : 0;
  const rad = (maxRot * Math.PI) / 180;
  // Width of a card rotated by maxRot, as a multiple of its unrotated width.
  const rotatedWidth = Math.cos(rad) + CARD_RATIO * Math.sin(rad);
  const avail = Math.max(40, width - pad * 2);

  // Largest card for which every corner stays visible and the fan still fits.
  const fitWidth = avail / (rotatedWidth + CORNER_FRACTION * (n - 1));
  const cardWidth = Math.max(24, Math.min(maxCardWidth, fitWidth));
  const cardHeight = cardWidth * CARD_RATIO;

  const step = n > 1 ? Math.min(cardWidth * 0.62, (avail - cardWidth * rotatedWidth) / (n - 1)) : 0;
  const total = cardWidth * rotatedWidth + step * (n - 1);
  const spill = (cardWidth * (rotatedWidth - 1)) / 2; // how far a rotated edge card pokes out sideways
  const left0 = (width - total) / 2 + spill;

  const arc = cardHeight * 0.1;
  const liftRoom = cardHeight * 0.3;
  const slots: FanSlot[] = [];
  for (let i = 0; i < count; i++) {
    const t = n > 1 ? (i - (n - 1) / 2) / ((n - 1) / 2) : 0; // −1 … 1 across the fan
    slots.push({ x: left0 + i * step, y: liftRoom + t * t * arc, rotate: t * maxRot });
  }
  return { cardWidth, cardHeight, step, height: liftRoom + cardHeight + arc + cardWidth * Math.sin(rad) + 4, slots };
}
