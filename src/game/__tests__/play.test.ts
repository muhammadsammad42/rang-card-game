/** play.test.ts — follow suit, trick winners before/after the reveal, and who may reveal. */
import { applyAction } from '../engine';
import { legalCards, trickWinner } from '../rules';
import { cardFromId } from '../deck';
import type { Play, Seat } from '../types';
import { playingFixture, playTrick, run } from './helpers';

const plays = (ids: string[], leader: Seat = 0): Play[] =>
  ids.map((id, i) => ({ seat: ((leader + i) % 4) as Seat, card: cardFromId(id) }));

describe('follow suit', () => {
  const s = playingFixture({
    hands: [['AH', '2C'], ['KH', '3C'], ['4C', '5C'], ['QH', '6C']],
    leader: 0,
    hidden: 'AS',
  });

  it('must play the led suit when holding it', () => {
    const led = run(s, [{ type: 'PLAY_CARD', seat: 0, cardId: 'AH' }]);
    const bad = applyAction(led, { type: 'PLAY_CARD', seat: 1, cardId: '3C' });
    expect(bad.ok).toBe(false);
    expect(bad.state).toBe(led);
    expect(applyAction(led, { type: 'PLAY_CARD', seat: 1, cardId: 'KH' }).ok).toBe(true);
  });

  it('may play any card when void in the led suit', () => {
    const led = run(s, [{ type: 'PLAY_CARD', seat: 0, cardId: 'AH' }, { type: 'PLAY_CARD', seat: 1, cardId: 'KH' }]);
    expect(applyAction(led, { type: 'PLAY_CARD', seat: 2, cardId: '5C' }).ok).toBe(true);
  });

  it('legalCards returns only the led suit when it can be followed', () => {
    const hand = ['AH', '2C', '9H'].map(cardFromId);
    const trick = { leader: 1 as Seat, plays: plays(['KH'], 1) };
    expect(legalCards(hand, trick).map((c) => c.id)).toEqual(['AH', '9H']);
    expect(legalCards(hand, { leader: 0, plays: [] })).toHaveLength(3);
  });
});

describe('trick winner', () => {
  it('before the reveal, the highest card of the led suit wins and off-suit cards never win', () => {
    expect(trickWinner(plays(['5H', 'AS', '9H', 'KD']), null)).toBe(2);
    expect(trickWinner(plays(['2C', 'AH', 'AS', 'AD']), null)).toBe(0);
  });

  it('after the reveal, any Rang card beats any non-Rang card', () => {
    // 2♠ (trump) beats A♥ (led suit)
    expect(trickWinner(plays(['AH', '2S', 'KH', 'QH']), 'S')).toBe(1);
  });

  it('the highest Rang card wins when several are played', () => {
    expect(trickWinner(plays(['AH', '2S', 'JS', '9S']), 'S')).toBe(2);
  });

  it('with no Rang card in the trick, the highest led-suit card still wins', () => {
    expect(trickWinner(plays(['10D', 'JD', 'AC', '3D']), 'S')).toBe(1);
  });

  it('a hidden Rang has no effect: the trump-suit card cannot win pre-reveal', () => {
    // West leads K♥, North A♥, East has no hearts and discards 2♠ WITHOUT revealing.
    let s = playingFixture({ hands: [['3H'], ['KH'], ['AH'], ['2S']], leader: 1, hidden: 'AS', completed: 12 });
    s = playTrick(s, ['KH', 'AH', '2S']);
    // South is the bidder with only the hidden card left? No — South still has 3H.
    s = playTrick(s, ['3H']);
    const t = s.completedTricks[12];
    expect(t.winner).toBe(2);
    expect(t.trumpActive).toBe(false);
    expect(t.outcome).toEqual({ type: 'team', team: 'A' });
  });

  it('the trick in which the Rang is revealed is judged with trump rules', () => {
    let s = playingFixture({ hands: [['3H', '4D'], ['KH', '5D'], ['AH', '6D'], ['2S', '7C']], leader: 1, hidden: 'AS' });
    s = playTrick(s, ['KH', 'AH']);
    s = run(s, [{ type: 'REVEAL_RANG', seat: 3 }, { type: 'PLAY_CARD', seat: 3, cardId: '2S' }]);
    expect(s.rangRevealed).toBe(true);
    expect(s.revealedBy).toBe(3);
    expect(s.revealedAtTrick).toBe(1);
    // the hidden A♠ went back to the bidder (South), who still must follow hearts
    expect(s.hands[0].map((c) => c.id)).toContain('AS');
    expect(applyAction(s, { type: 'PLAY_CARD', seat: 0, cardId: 'AS' }).ok).toBe(false);
    s = playTrick(s, ['3H']);
    expect(s.completedTricks[0].winner).toBe(3);
    expect(s.completedTricks[0].trumpActive).toBe(true);
    expect(s.completedTricks[0].revealedHere).toBe(true);
  });
});

describe('who may reveal the Rang', () => {
  const base = playingFixture({
    hands: [['3H', '4D'], ['KH', '5D'], ['AH', '6D'], ['2S', '7C']],
    leader: 0,
    hidden: 'AS',
    bidder: 0,
  });

  it('the bidder may reveal on their turn, even when leading', () => {
    const res = applyAction(base, { type: 'REVEAL_RANG', seat: 0 });
    expect(res.ok).toBe(true);
    expect(res.state.hands[0].map((c) => c.id)).toContain('AS');
    expect(res.state.hiddenCard).toBeNull();
  });

  it('nobody may reveal out of turn', () => {
    const res = applyAction(base, { type: 'REVEAL_RANG', seat: 1 });
    expect(res.ok).toBe(false);
    expect(res.state).toBe(base);
  });

  it('a non-bidder may not reveal when leading', () => {
    const s = { ...base, turn: 1 as Seat, currentTrick: { leader: 1 as Seat, plays: [] } };
    expect(applyAction(s, { type: 'REVEAL_RANG', seat: 1 }).ok).toBe(false);
  });

  it('a non-bidder who can follow suit may not reveal', () => {
    const s = run(base, [{ type: 'PLAY_CARD', seat: 0, cardId: '3H' }]);
    expect(applyAction(s, { type: 'REVEAL_RANG', seat: 1 }).ok).toBe(false);
  });

  it('a non-bidder who cannot follow suit may reveal (or just discard)', () => {
    const s = run(base, [
      { type: 'PLAY_CARD', seat: 0, cardId: '3H' },
      { type: 'PLAY_CARD', seat: 1, cardId: 'KH' },
      { type: 'PLAY_CARD', seat: 2, cardId: 'AH' },
    ]);
    expect(applyAction(s, { type: 'REVEAL_RANG', seat: 3 }).ok).toBe(true);
    expect(applyAction(s, { type: 'PLAY_CARD', seat: 3, cardId: '7C' }).ok).toBe(true);
  });

  it('the Rang can only be revealed once', () => {
    const s = run(base, [{ type: 'REVEAL_RANG', seat: 0 }]);
    expect(applyAction(s, { type: 'REVEAL_RANG', seat: 0 }).ok).toBe(false);
  });
});
