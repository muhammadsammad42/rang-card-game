/**
 * playableCards.test.ts — the full highlighting pipeline for the human seat:
 * engine (getLegalCards + revealError) → buildHandView → per-card state.
 * One test per case from the spec: leading, following, void, bidder reveal,
 * not my turn.
 */
import { getLegalCards } from '@/game/engine';
import { revealError } from '@/game/rules';
import type { GameState, Seat } from '@/game/types';

import { playingFixture, run } from '../../game/__tests__/helpers';
import { buildHandView } from '../handView';

const ME: Seat = 0;

function view(state: GameState) {
  const legal = new Set(getLegalCards(state, ME).map((c) => c.id));
  const myTurn = state.phase === 'PLAYING' && state.turn === ME;
  const cards = buildHandView(state.hands[ME], legal, myTurn);
  return {
    playable: cards.filter((c) => c.isPlayable).map((c) => c.card.id),
    states: cards.map((c) => c.state),
    canReveal: revealError(state, ME) === null,
  };
}

/** Seat 3 leads `ledId`, so it becomes seat 0's turn. */
const afterLead = (hands: string[][], ledId: string, bidder: Seat) =>
  run(playingFixture({ hands, leader: 3, bidder, hidden: 'AS' }), [{ type: 'PLAY_CARD', seat: 3, cardId: ledId }]);

describe('playable cards on my turn', () => {
  it('leading the trick: every card is highlighted', () => {
    const s = playingFixture({ hands: [['AH', '2C', '5D'], ['KH'], ['QH'], ['JH']], leader: ME, bidder: 1, hidden: 'AS' });
    const v = view(s);
    expect(v.playable).toEqual(['AH', '2C', '5D']);
    expect(v.states.every((st) => st === 'playable')).toBe(true);
    expect(v.canReveal).toBe(false); // non-bidder may not reveal when leading
  });

  it('following: only cards of the led suit are highlighted, the rest are blocked', () => {
    const s = afterLead([['AH', '2C', '5H', '9D'], ['KD'], ['QD'], ['3H']], '3H', 1);
    const v = view(s);
    expect(v.playable.sort()).toEqual(['5H', 'AH']);
    expect(v.states).toEqual(['playable', 'blocked', 'playable', 'blocked']);
    expect(v.canReveal).toBe(false);
  });

  it('void in the led suit: every card is highlighted and Reveal Rang is available', () => {
    const s = afterLead([['2C', '5D', '9D'], ['KD'], ['QD'], ['3H']], '3H', 1);
    const v = view(s);
    expect(v.playable).toEqual(['2C', '5D', '9D']);
    expect(v.canReveal).toBe(true);
  });

  it('bidder: Reveal Rang is available even while holding the led suit', () => {
    const s = afterLead([['AH', '2C'], ['KD'], ['QD'], ['3H']], '3H', ME);
    const v = view(s);
    expect(v.playable).toEqual(['AH']);
    expect(v.canReveal).toBe(true);
  });

  it('not my turn: nothing is highlighted, hand is idle, no reveal', () => {
    const s = playingFixture({ hands: [['AH', '2C'], ['KH'], ['QH'], ['JH']], leader: 1, bidder: 1, hidden: 'AS' });
    const v = view(s);
    expect(v.playable).toEqual([]);
    expect(v.states.every((st) => st === 'idle')).toBe(true);
    expect(v.canReveal).toBe(false);
  });
});
