/** bidding.test.ts — bidding order, validation, the 13-bid stop, and all-pass. */
import { applyAction, createMatch } from '../engine';
import type { GameState } from '../types';
import { run } from './helpers';

/** Puts a fresh match (with the given dealer) into the bidding phase. */
const biddingState = (dealer: 0 | 1 | 2 | 3): GameState => run(createMatch(5, dealer), [{ type: 'FINISH_DEAL' }]);

describe('bidding', () => {
  it('starts with the player to the dealer’s left and goes clockwise', () => {
    const s = biddingState(2);
    expect(s.phase).toBe('BIDDING');
    expect(s.turn).toBe(3);
    const after = run(s, [{ type: 'PASS', seat: 3 }]);
    expect(after.turn).toBe(0);
  });

  it('rejects a bid out of turn', () => {
    const s = biddingState(3);
    const res = applyAction(s, { type: 'BID', seat: 2, value: 8 });
    expect(res.ok).toBe(false);
    expect(res.state).toBe(s);
  });

  it('requires each bid to be higher than the current highest and within 8–13', () => {
    let s = biddingState(3); // South first
    expect(applyAction(s, { type: 'BID', seat: 0, value: 7 }).ok).toBe(false);
    expect(applyAction(s, { type: 'BID', seat: 0, value: 14 }).ok).toBe(false);
    expect(applyAction(s, { type: 'BID', seat: 0, value: 8.5 }).ok).toBe(false);
    s = run(s, [{ type: 'BID', seat: 0, value: 9 }]);
    expect(applyAction(s, { type: 'BID', seat: 1, value: 9 }).ok).toBe(false);
    expect(applyAction(s, { type: 'BID', seat: 1, value: 8 }).ok).toBe(false);
    s = run(s, [{ type: 'BID', seat: 1, value: 10 }, { type: 'PASS', seat: 2 }, { type: 'PASS', seat: 3 }]);
    expect(s.phase).toBe('CHOOSE_RANG');
    expect(s.bidder).toBe(1);
    expect(s.bid).toBe(10);
    expect(s.turn).toBe(1);
  });

  it('is a single round: the highest bidder wins after four calls', () => {
    const s = run(biddingState(3), [
      { type: 'BID', seat: 0, value: 8 },
      { type: 'BID', seat: 1, value: 9 },
      { type: 'PASS', seat: 2 },
      { type: 'BID', seat: 3, value: 11 },
    ]);
    expect(s.phase).toBe('CHOOSE_RANG');
    expect(s.bidder).toBe(3);
    expect(s.bid).toBe(11);
  });

  it('a bid of 13 ends bidding immediately', () => {
    const s = run(biddingState(3), [{ type: 'PASS', seat: 0 }, { type: 'BID', seat: 1, value: 13 }]);
    expect(s.phase).toBe('CHOOSE_RANG');
    expect(s.bidder).toBe(1);
    expect(s.bid).toBe(13);
    expect(s.bids).toHaveLength(2);
  });

  it('if all four pass, the first player (dealer’s left) becomes the bidder at 8', () => {
    const s = run(biddingState(1), [
      { type: 'PASS', seat: 2 },
      { type: 'PASS', seat: 3 },
      { type: 'PASS', seat: 0 },
      { type: 'PASS', seat: 1 },
    ]);
    expect(s.phase).toBe('CHOOSE_RANG');
    expect(s.bidder).toBe(2);
    expect(s.bid).toBe(8);
    expect(s.forcedBid).toBe(true);
  });
});

describe('choosing the Rang', () => {
  it('only the bidder may choose, and only a card from their hand', () => {
    const s = run(biddingState(3), [
      { type: 'BID', seat: 0, value: 8 },
      { type: 'PASS', seat: 1 },
      { type: 'PASS', seat: 2 },
      { type: 'PASS', seat: 3 },
    ]);
    const other = s.hands[1][0].id;
    expect(applyAction(s, { type: 'CHOOSE_RANG', seat: 1, cardId: other }).ok).toBe(false);
    expect(applyAction(s, { type: 'CHOOSE_RANG', seat: 0, cardId: other }).ok).toBe(false);
    expect(applyAction(s, { type: 'CHOOSE_RANG', seat: 0, cardId: s.hands[0][2].id }).ok).toBe(true);
  });
});
