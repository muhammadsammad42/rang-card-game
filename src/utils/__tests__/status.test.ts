/**
 * status.test.ts — status-bar messages, the pile streak chip, and the full
 * highlighting pipeline (engine legal cards → buildHandView) on real states.
 */
import { playingFixture } from '@/game/__tests__/helpers';
import { applyAction, getLegalCards } from '@/game/engine';
import { getPlayers } from '@/game/players';
import type { GameState } from '@/game/types';

import { buildHandView } from '../handView';
import { statusInfo, statusLine, streakChip } from '../status';

const players = getPlayers('Ali');
const play = (s: GameState, seat: 0 | 1 | 2 | 3, cardId: string): GameState => {
  const r = applyAction(s, { type: 'PLAY_CARD', seat, cardId });
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

// East (3) leads, then it's the human's turn (seats play 3 → 0 → 1 → 2). The human holds a diamond and two clubs.
const base = () =>
  playingFixture({
    hands: [['5D', 'KC', '2C'], ['9D', '3S', '4S'], ['JD', '7H', '8H'], ['QD', '5S', '6S']],
    leader: 3,
    bidder: 2,
    bid: 8,
    rangSuit: 'H',
    hidden: '9H',
  });

describe('statusInfo', () => {
  it('waits for the player whose turn it is', () => {
    expect(statusInfo(base(), players, 0, null, false)).toEqual({ text: 'Waiting for Abdullah…', tone: 'wait' });
  });

  it('tells you which suit to follow', () => {
    const s = play(base(), 3, 'QD');
    expect(statusInfo(s, players, 0, null, false)).toEqual({ text: 'Your turn: follow ♦︎ Diamonds', tone: 'turn' });
    expect(statusLine(s, players, 0, null, false)).toBe('Your turn: follow ♦︎ Diamonds');
  });

  it('announces the trick winner with a win/lose tone from your point of view', () => {
    let s = play(base(), 3, 'QD');
    s = play(s, 0, '5D');
    s = play(s, 1, '9D');
    s = play(s, 2, 'JD');
    const record = s.completedTricks[s.completedTricks.length - 1];
    expect(record.winner).toBe(3);
    expect(statusInfo(s, players, 0, record, false)).toEqual({ text: 'Abdullah wins trick 1', tone: 'lose' });
  });
});

describe('highlighting pipeline: engine → isPlayable', () => {
  it('only the led suit is playable when you can follow', () => {
    const s = play(base(), 3, 'QD');
    const legal = new Set(getLegalCards(s, 0).map((c) => c.id));
    const view = buildHandView(s.hands[0], legal, true);
    expect(view.filter((v) => v.isPlayable).map((v) => v.card.id)).toEqual(['5D']);
    expect(view.filter((v) => v.state === 'blocked').map((v) => v.card.id).sort()).toEqual(['2C', 'KC']);
  });

  it('every card is playable when you cannot follow suit', () => {
    const s = play(base(), 3, '5S'); // you hold no spades
    const legal = new Set(getLegalCards(s, 0).map((c) => c.id));
    expect(buildHandView(s.hands[0], legal, true).every((v) => v.isPlayable)).toBe(true);
  });
});

describe('streakChip', () => {
  it('is hidden before the reveal and when the pile is empty', () => {
    expect(streakChip(base(), players, 0)).toBeNull();
  });

  it('summarises the streak after the reveal', () => {
    const s: GameState = { ...base(), rangRevealed: true, pile: 2, streak: { seat: 3, count: 1 } };
    expect(streakChip(s, players, 0)).toBe('Abdullah won last · 1 more → 3 tricks');
  });
});
