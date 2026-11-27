import type { GameState } from '@/game/types';
import { gameSoundsFor } from '@/utils/gameSounds';

import { playingFixture } from '../../game/__tests__/helpers';
import { type AudioApi, createSoundService, type SoundPlayer } from '../soundService';

jest.mock('@/theme/sounds', () => ({
  SOUND_FILES: { tap: 1, play: 2, win: 3 },
  SOUND_VOICES: { play: 2 },
  SOUND_MIN_GAP: { play: 90 },
  VOLUME_LEVEL: { low: 0.35, medium: 0.65, high: 1 },
}));

function fakeApi(opts: { failCreate?: boolean; failPlay?: boolean } = {}) {
  const players: (SoundPlayer & { plays: number; removed: boolean })[] = [];
  const api: AudioApi = {
    setAudioMode: () => Promise.resolve(),
    createPlayer: () => {
      if (opts.failCreate) throw new Error('no audio');
      const p = {
        volume: 1,
        plays: 0,
        removed: false,
        play() {
          if (opts.failPlay) throw new Error('boom');
          p.plays++;
        },
        seekTo: () => Promise.resolve(),
        remove() {
          p.removed = true;
        },
      };
      players.push(p);
      return p;
    },
  };
  return { api, players };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('soundService', () => {
  it('preloads one player per sound (two for frequent ones) and plays at the chosen volume', async () => {
    const { api, players } = fakeApi();
    const s = createSoundService(() => api);
    s.init();
    expect(players).toHaveLength(4);
    s.configure({ enabled: true, volume: 'low' });
    s.play('tap');
    await flush();
    expect(players[0].plays).toBe(1);
    expect(players[0].volume).toBe(0.35);
  });

  it('does nothing when sound is off', async () => {
    const { api, players } = fakeApi();
    const s = createSoundService(() => api);
    s.init();
    s.configure({ enabled: false, volume: 'high' });
    s.play('tap');
    s.play('win');
    await flush();
    expect(players.every((p) => p.plays === 0)).toBe(true);
  });

  it('never throws when audio is missing or a sound fails', async () => {
    expect(() => createSoundService(() => { throw new Error('no module'); }).play('tap')).not.toThrow();
    expect(() => createSoundService(() => fakeApi({ failCreate: true }).api).play('tap')).not.toThrow();
    const s = createSoundService(() => fakeApi({ failPlay: true }).api);
    expect(() => s.play('win')).not.toThrow();
    await flush();
  });

  it('throttles the same sound and alternates voices so repeats overlap', async () => {
    let t = 0;
    const { api, players } = fakeApi();
    const s = createSoundService(() => api, () => t);
    s.init();
    const [a, b] = players.slice(1, 3); // the two 'play' voices
    s.play('play');
    t = 50;
    s.play('play'); // within 90 ms → dropped
    t = 200;
    s.play('play');
    await flush();
    expect([a.plays, b.plays]).toEqual([1, 1]);
  });

  it('releases every player', () => {
    const { api, players } = fakeApi();
    const s = createSoundService(() => api);
    s.init();
    s.release();
    expect(players.every((p) => p.removed)).toBe(true);
  });
});

describe('gameSoundsFor', () => {
  const base = playingFixture({ hands: [['AH', '2C'], ['KH'], ['QH'], ['JH']], leader: 1, bidder: 1, hidden: 'AS' });

  it('reveal beats everything else in the same change; nothing when unchanged', () => {
    expect(gameSoundsFor(base, { ...base, rangRevealed: true }, 0)).toEqual(['reveal']);
    expect(gameSoundsFor(base, base, 0)).toEqual([]);
  });

  it('plays "your turn" only for me, plus a flick for another player\'s card', () => {
    const next: GameState = { ...base, turn: 2, currentTrick: { leader: 1, plays: [{ seat: 1, card: base.hands[1][0] }] } };
    expect(gameSoundsFor(base, next, 0)).toEqual(['play']);
    expect(gameSoundsFor(base, { ...base, turn: 0 }, 0)).toEqual(['turn']);
    expect(gameSoundsFor(base, { ...base, turn: 0 }, null)).toEqual([]);
  });

  it('win or lose at the end of the hand, deal at the start of a new one', () => {
    const over = (team: 'A' | 'B') => ({ ...base, phase: 'HAND_OVER', result: { winnerTeam: team } }) as unknown as GameState;
    expect(gameSoundsFor(base, over('A'), 0)).toEqual(['win']);
    expect(gameSoundsFor(base, over('B'), 0)).toEqual(['lose']);
    expect(gameSoundsFor(base, { ...base, handNumber: 2, phase: 'DEAL_5' }, 0)).toEqual(['deal']);
  });

  it('pile collected and bids', () => {
    expect(gameSoundsFor({ ...base, pile: 3 }, { ...base, pile: 0 }, 0)).toEqual(['pile']);
    const bidding = { ...base, phase: 'BIDDING' } as GameState;
    expect(gameSoundsFor(bidding, { ...bidding, bids: [{ seat: 1, value: 9 }] }, 0)).toEqual(['bid']);
    expect(gameSoundsFor(bidding, { ...bidding, bids: [{ seat: 1, value: 'pass' }] }, 0)).toEqual([]);
  });
});
