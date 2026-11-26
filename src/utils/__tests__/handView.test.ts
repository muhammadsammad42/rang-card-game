/**
 * handView.test.ts — the UI helpers behind playable-card highlighting and the
 * hand fan. Pure functions, so they're tested without rendering anything.
 */
import { cardFromId, isRedSuit } from '@/game/deck';
import type { Card, CurrentTrick } from '@/game/types';
import { CARD_RATIO } from '@/hooks/useLayout';

import { buildHandView, cardA11yLabel, CORNER_FRACTION, fanLayout, illegalMessage, sortForDisplay } from '../handView';

const cards = (...ids: string[]): Card[] => ids.map(cardFromId);
const ids = (cs: Card[]) => cs.map((c) => c.id);
const trick = (...plays: [number, string][]): CurrentTrick => ({
  leader: plays[0]?.[0] as 0,
  plays: plays.map(([seat, id]) => ({ seat: seat as 0, card: cardFromId(id) })),
});

describe('sortForDisplay', () => {
  const hand = cards('2H', 'AS', '10D', 'KH', '3C', 'AD', '9S', 'QC');

  it('groups by suit in alternating colours, high to low within a suit', () => {
    const sorted = sortForDisplay(hand, 'suit');
    expect(ids(sorted)).toEqual(['AS', '9S', 'KH', '2H', 'QC', '3C', 'AD', '10D']);
    // Neighbouring suit groups never share a colour.
    const groups = [...new Set(sorted.map((c) => c.suit))];
    for (let i = 1; i < groups.length; i++) expect(isRedSuit(groups[i])).not.toBe(isRedSuit(groups[i - 1]));
  });

  it('sorts by rank high to low, ties in suit order', () => {
    expect(ids(sortForDisplay(hand, 'rank'))).toEqual(['AS', 'AD', 'KH', 'QC', '10D', '9S', '3C', '2H']);
  });

  it('does not modify the input', () => {
    const copy = hand.slice();
    sortForDisplay(hand, 'rank');
    expect(hand).toEqual(copy);
  });
});

describe('buildHandView (engine legal ids → isPlayable per card)', () => {
  const hand = cards('AS', 'KH', '2H', 'QC');

  it('marks legal cards playable and the rest blocked on my turn', () => {
    const view = buildHandView(hand, new Set(['KH', '2H']), true);
    expect(view.map((v) => [v.card.id, v.isPlayable, v.state])).toEqual([
      ['AS', false, 'blocked'],
      ['KH', true, 'playable'],
      ['2H', true, 'playable'],
      ['QC', false, 'blocked'],
    ]);
  });

  it('highlights every card when all are legal (leading a trick)', () => {
    const view = buildHandView(hand, new Set(ids(hand)), true);
    expect(view.every((v) => v.state === 'playable')).toBe(true);
  });

  it('is neutral and nothing is playable when it is not my turn', () => {
    const view = buildHandView(hand, new Set(ids(hand)), false);
    expect(view.every((v) => v.state === 'idle' && !v.isPlayable)).toBe(true);
  });
});

describe('illegalMessage / cardA11yLabel', () => {
  it('names the suit that must be followed', () => {
    expect(illegalMessage(trick([1, '4D']))).toBe('You must follow ♦︎ Diamonds');
    expect(illegalMessage(trick([3, 'JC'], [0, '2C']))).toBe('You must follow ♣︎ Clubs');
  });

  it('has a fallback when nothing was led', () => {
    expect(illegalMessage({ leader: 0, plays: [] })).toMatch(/cannot be played/);
  });

  it('builds spoken labels', () => {
    expect(cardA11yLabel('Eight of Diamonds', 'playable', false)).toBe('Eight of Diamonds, playable');
    expect(cardA11yLabel('Two of Clubs', 'blocked', false)).toMatch(/not playable/);
    expect(cardA11yLabel('Ace of Spades', 'idle', true)).toBe('Ace of Spades, selected');
  });
});

describe('fanLayout', () => {
  const widths = [300, 320, 360, 393, 411, 480, 600, 744];

  it.each(widths)('keeps every card of a 1–13 card hand fully on a %ipx screen', (width) => {
    for (let n = 1; n <= 13; n++) {
      const { slots, cardWidth } = fanLayout(n, width, 86);
      const h = cardWidth * CARD_RATIO;
      expect(slots).toHaveLength(n);
      for (const s of slots) {
        // Bounding box of the card rotated about its centre.
        const r = (Math.abs(s.rotate) * Math.PI) / 180;
        const half = (cardWidth * Math.cos(r) + h * Math.sin(r)) / 2;
        const cx = s.x + cardWidth / 2;
        expect(cx - half).toBeGreaterThanOrEqual(-0.01);
        expect(cx + half).toBeLessThanOrEqual(width + 0.01);
      }
    }
  });

  it.each(widths)('leaves each card corner readable on a %ipx screen', (width) => {
    for (let n = 2; n <= 13; n++) {
      const { step, cardWidth } = fanLayout(n, width, 86);
      expect(step).toBeGreaterThanOrEqual(cardWidth * CORNER_FRACTION - 0.01);
    }
  });

  it('uses the full card size when there is room, and shrinks only when needed', () => {
    expect(fanLayout(5, 400, 80).cardWidth).toBe(80);
    expect(fanLayout(13, 320, 80).cardWidth).toBeLessThan(80);
  });

  it('is symmetric around the centre', () => {
    const { slots, cardWidth } = fanLayout(13, 400, 80);
    const first = slots[0].x;
    const last = slots[12].x + cardWidth;
    expect(first + last).toBeCloseTo(400, 5);
    expect(slots[0].rotate).toBeCloseTo(-slots[12].rotate, 5);
  });
});
