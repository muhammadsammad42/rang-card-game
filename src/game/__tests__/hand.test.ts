/** hand.test.ts — auto-reveal, winning/losing at the bid boundary, illegal actions, and full-hand simulations. */
import { applyAction, createMatch, getPublicView } from '../engine';
import type { GameAction, GameState } from '../types';
import { playingFixture, playRandomHand, playTrick, run } from './helpers';

describe('bidder auto-reveal', () => {
  it('reveals automatically when the bidder has only the hidden card left', () => {
    let s = playingFixture({ hands: [[], ['2H'], ['3H'], ['4H']], leader: 1, bidder: 0, hidden: 'AS', completed: 12 });
    s = playTrick(s, ['2H', '3H', '4H']);
    expect(s.turn).toBe(0);
    expect(s.rangRevealed).toBe(true);
    expect(s.revealedBy).toBe(0);
    expect(s.autoRevealed).toBe(true);
    expect(s.hands[0].map((c) => c.id)).toEqual(['AS']);
    s = playTrick(s, ['AS']);
    expect(s.completedTricks[12].winner).toBe(0); // the revealed trump wins
  });
});

describe('winning and losing a hand', () => {
  /** One trick left; Team A (bidder South, bid 8) already has 7 tricks. */
  const lastTrick = (southCard: string) =>
    playingFixture({
      hands: [[southCard], ['5H'], ['6H'], ['7H']],
      leader: 0,
      bidder: 0,
      bid: 8,
      revealed: true,
      completed: 12,
      tricksWon: { A: 7, B: 5 },
    });

  it('bid 8 with exactly 8 tricks wins', () => {
    const s = playTrick(lastTrick('AH'), ['AH', '5H', '6H', '7H']);
    expect(s.phase).toBe('HAND_OVER');
    expect(s.tricksWon).toEqual({ A: 8, B: 5 });
    expect(s.result?.winnerTeam).toBe('A');
    expect(s.score).toEqual({ A: 1, B: 0 });
  });

  it('bid 8 with only 7 tricks loses (defenders needed 6)', () => {
    const s = playTrick(lastTrick('2H'), ['2H', '5H', '6H', '7H']);
    expect(s.tricksWon).toEqual({ A: 7, B: 6 });
    expect(s.result?.winnerTeam).toBe('B');
    expect(s.score).toEqual({ A: 0, B: 1 });
  });

  it('the dealer rotates clockwise on Next Hand and the score is kept', () => {
    const done = playTrick(lastTrick('AH'), ['AH', '5H', '6H', '7H']);
    const next = run(done, [{ type: 'NEXT_HAND', seed: 11 }]);
    expect(next.dealer).toBe(0); // fixture dealer was 3 (East)
    expect(next.handNumber).toBe(2);
    expect(next.score).toEqual({ A: 1, B: 0 });
    expect(next.phase).toBe('DEAL_5');
  });
});

describe('illegal actions never change the state', () => {
  const s = playingFixture({
    hands: [
      ['AH', '2C'],
      ['KH', '3C'],
      ['4C', '5C'],
      ['QH', '6C'],
    ],
    leader: 0,
    hidden: 'AS',
  });
  const illegal: [string, GameAction][] = [
    ['play out of turn', { type: 'PLAY_CARD', seat: 1, cardId: 'KH' }],
    ['play a card not in hand', { type: 'PLAY_CARD', seat: 0, cardId: 'KH' }],
    ['bid during play', { type: 'BID', seat: 0, value: 9 }],
    ['pass during play', { type: 'PASS', seat: 0 }],
    ['choose Rang during play', { type: 'CHOOSE_RANG', seat: 0, cardId: 'AH' }],
    ['next hand mid-hand', { type: 'NEXT_HAND', seed: 1 }],
    ['finish deal with no deal', { type: 'FINISH_DEAL' }],
    ['reveal by a non-bidder out of turn', { type: 'REVEAL_RANG', seat: 2 }],
    ['unknown seat', { type: 'PLAY_CARD', seat: 7 as never, cardId: 'AH' }],
    ['unknown action', { type: 'BOGUS' } as unknown as GameAction],
  ];
  it.each(illegal)('%s is rejected', (_name, action) => {
    const snapshot = JSON.stringify(s);
    const res = applyAction(s, action);
    expect(res.ok).toBe(false);
    expect(res.state).toBe(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('restart', () => {
  it('Restart Hand redeals with the same dealer and score; Restart Match resets the score', () => {
    const s: GameState = { ...createMatch(3, 2), score: { A: 2, B: 1 } };
    const hand = run(s, [{ type: 'RESTART_HAND', seed: 8 }]);
    expect(hand.dealer).toBe(2);
    expect(hand.score).toEqual({ A: 2, B: 1 });
    expect(hand.phase).toBe('DEAL_5');
    const match = run(s, [{ type: 'RESTART_MATCH', seed: 8 }]);
    expect(match.score).toEqual({ A: 0, B: 0 });
    expect(match.handNumber).toBe(1);
  });
});

describe('public view (no cheating)', () => {
  it('hides the Rang from everyone but the bidder until it is revealed', () => {
    const s = playingFixture({ hands: [['AH'], ['KH'], ['QH'], ['JH']], leader: 0, bidder: 0, hidden: 'AS' });
    expect(getPublicView(s, 0).rangSuit).toBe('S');
    expect(getPublicView(s, 0).hiddenCard?.id).toBe('AS');
    for (const seat of [1, 2, 3] as const) {
      expect(getPublicView(s, seat).rangSuit).toBeNull();
      expect(getPublicView(s, seat).hiddenCard).toBeNull();
    }
    const revealed = run(s, [{ type: 'REVEAL_RANG', seat: 0 }]);
    expect(getPublicView(revealed, 2).rangSuit).toBe('S');
  });
});

describe('full hands with random legal play (stability)', () => {
  it.each(Array.from({ length: 150 }, (_, i) => i + 1))('seed %i completes a valid hand', (seed) => {
    const end = playRandomHand(createMatch(seed), seed * 7919);
    expect(end.phase).toBe('HAND_OVER');
    expect(end.completedTricks).toHaveLength(13);
    expect(end.tricksWon.A + end.tricksWon.B).toBe(13);
    expect(end.pile).toBe(0);
    expect(end.hands.every((h) => h.length === 0)).toBe(true);
    const played = end.completedTricks.flatMap((t) => t.plays.map((p) => p.card.id));
    expect(new Set(played).size).toBe(52);
    expect(end.rangRevealed).toBe(true); // the bidder must reveal by trick 13 at the latest
    const bt = end.result!.biddingTeam;
    expect(end.result!.winnerTeam === bt).toBe(end.tricksWon[bt] >= end.bid!);
  });
});
