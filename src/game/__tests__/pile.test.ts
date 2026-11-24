/** pile.test.ts — the middle pile after the reveal: streaks, collection, reset and leftovers. */
import { playingFixture, playTrick } from './helpers';

/**
 * Rang = ♠ (already revealed). Five tricks left (8 already played, 4–4).
 *  T9  West  A♥ wins            → pile 1, West streak 1
 *  T10 West  K♥ wins again      → West collects 2 for Team B, streak resets
 *  T11 North A♣ wins            → pile 1
 *  T12 East  A♦ wins            → pile 2 (different player, no collection)
 *  T13 South trumps with 2♠     → pile 3 left over → last-trick winner (Team A)
 */
const scenario = () =>
  playingFixture({
    hands: [
      ['4H', '7H', '4C', '3D', '2S'],
      ['AH', 'KH', '2C', '4D', '6D'],
      ['2H', '5H', 'AC', '2D', '7D'],
      ['3H', '6H', '3C', 'AD', '5D'],
    ],
    leader: 1,
    bidder: 0,
    bid: 8,
    rangSuit: 'S',
    revealed: true,
    completed: 8,
    tricksWon: { A: 4, B: 4 },
  });

describe('middle pile after the reveal', () => {
  it('a trick won after the reveal goes to the pile, not to a team', () => {
    const s = playTrick(scenario(), ['AH', '2H', '3H', '4H']);
    expect(s.pile).toBe(1);
    expect(s.tricksWon).toEqual({ A: 4, B: 4 });
    expect(s.streak).toEqual({ seat: 1, count: 1 });
    expect(s.completedTricks[8].outcome).toEqual({ type: 'pile', pileSize: 1 });
  });

  it('the same player winning two in a row collects the whole pile, then the streak resets', () => {
    let s = playTrick(scenario(), ['AH', '2H', '3H', '4H']);
    s = playTrick(s, ['KH', '5H', '6H', '7H']);
    expect(s.tricksWon).toEqual({ A: 4, B: 6 });
    expect(s.pile).toBe(0);
    expect(s.streak).toEqual({ seat: null, count: 0 });
    expect(s.completedTricks[9].outcome).toEqual({ type: 'collected', team: 'B', count: 2 });
  });

  it('wins by different players do not collect; leftovers go to the last trick’s winner', () => {
    let s = playTrick(scenario(), ['AH', '2H', '3H', '4H']);
    s = playTrick(s, ['KH', '5H', '6H', '7H']);
    s = playTrick(s, ['2C', 'AC', '3C', '4C']); // North wins
    expect(s.pile).toBe(1);
    s = playTrick(s, ['2D', 'AD', '3D', '4D']); // East wins
    expect(s.pile).toBe(2);
    expect(s.streak).toEqual({ seat: 3, count: 1 });
    s = playTrick(s, ['5D', '2S', '6D', '7D']); // South trumps
    expect(s.completedTricks[12].winner).toBe(0);
    expect(s.completedTricks[12].outcome).toEqual({ type: 'collected', team: 'A', count: 3, leftover: true });
    expect(s.tricksWon).toEqual({ A: 7, B: 6 });
    expect(s.pile).toBe(0);
    expect(s.phase).toBe('HAND_OVER');
    expect(s.result?.leftover).toEqual({ team: 'A', count: 3 });
  });

  it('partners winning consecutively do not count as a streak (same PLAYER only)', () => {
    let s = playingFixture({
      hands: [
        ['3C', 'AD', '5H'],
        ['4C', '4D', '6H'],
        ['AC', '2D', '7H'],
        ['2C', '3D', '8H'],
      ],
      leader: 2,
      rangSuit: 'S',
      revealed: true,
      completed: 10,
      tricksWon: { A: 5, B: 5 },
    });
    s = playTrick(s, ['AC', '2C', '3C', '4C']); // North
    s = playTrick(s, ['2D', '3D', 'AD', '4D']); // South (North's partner)
    expect(s.pile).toBe(2);
    expect(s.tricksWon).toEqual({ A: 5, B: 5 });
    s = playTrick(s, ['5H', '6H', '7H', '8H']); // East wins the last trick → takes the leftover pile
    expect(s.tricksWon).toEqual({ A: 5, B: 8 });
  });
});
