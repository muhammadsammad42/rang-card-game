/** deck.test.ts — the deck, the seeded shuffle, and both deals. */
import { createDeck, mulberry32, shuffle } from '../deck';
import { applyAction, createMatch } from '../engine';
import { run } from './helpers';

describe('deck', () => {
  it('has 52 unique cards, 13 per suit', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    for (const suit of ['S', 'H', 'D', 'C']) expect(deck.filter((c) => c.suit === suit)).toHaveLength(13);
  });

  it('shuffles deterministically for a given seed and keeps every card', () => {
    const a = shuffle(createDeck(), mulberry32(42));
    const b = shuffle(createDeck(), mulberry32(42));
    const c = shuffle(createDeck(), mulberry32(43));
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id));
    expect(new Set(a.map((x) => x.id)).size).toBe(52);
  });
});

describe('dealing', () => {
  it('deals 5 cards each first, keeping 32 in the stock', () => {
    const s = createMatch(7, 3);
    expect(s.phase).toBe('DEAL_5');
    expect(s.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(s.stock).toHaveLength(32);
  });

  it('after the Rang is chosen everyone has 13 (bidder: 12 in hand + 1 face down)', () => {
    let s = createMatch(7, 3); // dealer East → South bids first
    s = run(s, [
      { type: 'FINISH_DEAL' },
      { type: 'BID', seat: 0, value: 9 },
      { type: 'PASS', seat: 1 },
      { type: 'PASS', seat: 2 },
      { type: 'PASS', seat: 3 },
    ]);
    expect(s.phase).toBe('CHOOSE_RANG');
    const hidden = s.hands[0][0];
    s = run(s, [{ type: 'CHOOSE_RANG', seat: 0, cardId: hidden.id }, { type: 'FINISH_DEAL' }]);
    expect(s.phase).toBe('PLAYING');
    expect(s.hands.map((h) => h.length)).toEqual([12, 13, 13, 13]);
    expect(s.hiddenCard?.id).toBe(hidden.id);
    expect(s.rangSuit).toBe(hidden.suit);
    expect(s.stock).toHaveLength(0);
    const all = [...s.hands.flat(), s.hiddenCard!].map((c) => c.id);
    expect(new Set(all).size).toBe(52);
    // the bidder leads the first trick
    expect(s.turn).toBe(0);
  });

  it('the same seed always produces the same hands', () => {
    expect(createMatch(99, 0).hands).toEqual(createMatch(99, 0).hands);
    expect(applyAction(createMatch(99, 0), { type: 'FINISH_DEAL' }).ok).toBe(true);
  });
});
