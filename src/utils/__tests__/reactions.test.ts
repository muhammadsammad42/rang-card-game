import { botReactions, createRateLimiter, isReactionEmoji, REACTION_EMOJIS } from '../reactions';
import { playingFixture } from '../../game/__tests__/helpers';
import type { GameState } from '@/game/types';

const always = () => 0;
const never = () => 0.99;
const bots = (s: number) => s !== 0;

describe('reactions', () => {
  it('has exactly the 10 allowed emojis', () => {
    expect(REACTION_EMOJIS).toHaveLength(10);
    expect(isReactionEmoji('🔥')).toBe(true);
    expect(isReactionEmoji('hello')).toBe(false);
  });

  it('rate-limits to 1 per 2 seconds per key', () => {
    const allow = createRateLimiter();
    expect(allow(0, 1000)).toBe(true);
    expect(allow(0, 2500)).toBe(false);
    expect(allow(1, 2500)).toBe(true);
    expect(allow(0, 3000)).toBe(true);
  });

  const base = playingFixture({ hands: [['AH'], ['KH'], ['QH'], ['JH']], leader: 0, hidden: 'AS' });

  it('a bot may react when the Rang is revealed', () => {
    const next: GameState = { ...base, rangRevealed: true };
    expect(botReactions(base, next, bots, always)).toHaveLength(1);
    expect(botReactions(base, next, bots, never)).toEqual([]);
    expect(botReactions(base, next, () => false, always)).toEqual([]);
  });

  it('a bot that wins a trick may react; the human never gets a bot reaction', () => {
    const rec = (winner: 0 | 1) => ({ number: 1, leader: 0 as const, plays: [], winner, trumpActive: false, revealedHere: false, outcome: { type: 'team' as const, team: 'A' as const } });
    const r = botReactions(base, { ...base, completedTricks: [rec(1)] }, bots, always);
    expect(r).toEqual([{ seat: 1, emoji: expect.any(String) }]);
    expect(botReactions(base, { ...base, completedTricks: [rec(0)] }, bots, always)).toEqual([]);
  });

  it('end of hand: at most two bot reactions; nothing across different hands', () => {
    const over = { ...base, phase: 'HAND_OVER', result: { winnerTeam: 'A' } } as unknown as GameState;
    expect(botReactions(base, over, bots, always)).toHaveLength(2);
    expect(botReactions(base, { ...over, handNumber: 2 }, bots, always)).toEqual([]);
  });
});
