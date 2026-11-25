/** ai.test.ts — bots always choose legal actions and follow the main heuristics. */
import { chooseRangCard, decideBotAction, evaluateHand } from '../ai';
import { cardFromId, mulberry32 } from '../deck';
import { applyAction, createMatch, getPublicView } from '../engine';
import type { BotLevel } from '../ai';
import type { GameState } from '../types';
import { playingFixture, playTrick } from './helpers';

const cards = (ids: string[]) => ids.map(cardFromId);

/** Plays a whole hand with four bots; every bot action must be accepted by the engine. */
function botHand(seed: number, level: BotLevel): GameState {
  const rng = mulberry32(seed);
  let s = createMatch(seed);
  for (let guard = 0; guard < 400 && s.phase !== 'HAND_OVER'; guard++) {
    if (s.phase === 'DEAL_5' || s.phase === 'DEAL_REST') {
      s = applyAction(s, { type: 'FINISH_DEAL' }).state;
      continue;
    }
    const action = decideBotAction(getPublicView(s, s.turn), level, rng);
    if (!action) throw new Error(`bot returned no action in ${s.phase}`);
    const res = applyAction(s, action);
    if (!res.ok) throw new Error(`illegal bot action ${JSON.stringify(action)}: ${res.error}`);
    s = res.state;
  }
  return s;
}

describe('bots only make legal moves', () => {
  it.each(Array.from({ length: 60 }, (_, i) => i + 1))('normal bots finish hand #%i', (seed) => {
    expect(botHand(seed, 'normal').phase).toBe('HAND_OVER');
  });
  it.each(Array.from({ length: 30 }, (_, i) => i + 100))('easy bots finish hand #%i', (seed) => {
    expect(botHand(seed, 'easy').phase).toBe('HAND_OVER');
  });
});

describe('normal bidding heuristics', () => {
  it('passes with a weak hand', () => {
    expect(evaluateHand(cards(['2S', '5H', '7D', '9C', '3H']))).toBeNull();
  });
  it('bids 8 with two high cards in one suit', () => {
    expect(evaluateHand(cards(['AS', 'KS', '4H', '6D', '2C']))).toBe(8);
  });
  it('bids higher only with a very strong hand', () => {
    expect(evaluateHand(cards(['AS', 'KS', 'QS', '9S', 'AH']))).toBeGreaterThanOrEqual(10);
  });
});

describe('Rang choice', () => {
  it('picks the longest suit and hides its lowest card', () => {
    expect(chooseRangCard(cards(['AH', '3D', '9D', 'KD', '2S']), 'normal').id).toBe('3D');
  });
  it('breaks length ties by high cards', () => {
    expect(chooseRangCard(cards(['AH', '4H', '9D', '3D', '2S']), 'normal').id).toBe('4H');
  });
});

describe('normal play heuristics', () => {
  it('does not overtake a partner who is already winning', () => {
    // North (partner of South) leads A♥; West plays 2♥; East 3♥; South holds K♥ and 4♥.
    let s = playingFixture({ hands: [['KH', '4H'], ['2H', '5C'], ['AH', '6C'], ['3H', '7C']], leader: 2, hidden: 'AS', bidder: 1 });
    s = playTrick(s, ['AH', '3H']);
    // now South's turn? order: North(2) → East(3) → South(0)
    const action = decideBotAction(getPublicView(s, 0), 'normal');
    expect(action).toEqual({ type: 'PLAY_CARD', seat: 0, cardId: '4H' });
  });

  it('wins as cheaply as possible when last to play', () => {
    let s = playingFixture({ hands: [['KH', 'QH', '2C'], ['9H', '5C', '3C'], ['4H', '6C', '4C'], ['5H', '7C', '8C']], leader: 1, hidden: 'AS', bidder: 2 });
    s = playTrick(s, ['9H', '4H', '5H']);
    const action = decideBotAction(getPublicView(s, 0), 'normal');
    expect(action).toEqual({ type: 'PLAY_CARD', seat: 0, cardId: 'QH' });
  });

  it('the bidder reveals to trump a trick the opponents are winning', () => {
    // South is the bidder (Rang ♠ hidden), void in hearts, holding a spade.
    let s = playingFixture({ hands: [['3S', '2C'], ['AH', '5C'], ['4H', '6C'], ['5H', '7C']], leader: 1, hidden: 'AS', bidder: 0 });
    s = playTrick(s, ['AH', '4H', '5H']);
    expect(decideBotAction(getPublicView(s, 0), 'normal')).toEqual({ type: 'REVEAL_RANG', seat: 0 });
  });

  it('a bot that is not the bidder never learns the hidden Rang', () => {
    const s = playingFixture({ hands: [['3S'], ['AH'], ['4H'], ['5H']], leader: 1, hidden: 'AS', bidder: 0 });
    for (const seat of [1, 2, 3] as const) expect(getPublicView(s, seat).rangSuit).toBeNull();
  });
});
