/**
 * historyService.test.ts — the cloud-history record and the offline queue,
 * tested with Firebase NOT configured (the app must still work).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createMatch } from '@/game/engine';
import { getPlayers } from '@/game/players';
import { playRandomHand } from '@/game/__tests__/helpers';

import { buildRecord, fetchHistory, saveHandResult, summarize } from '../historyService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// Simulate a project without a .env file.
jest.mock('../firebase', () => ({ isFirebaseConfigured: false, getDb: () => null }));

const finishedHand = () => playRandomHand(createMatch(21), 99);
const players = getPlayers('Tester');

beforeEach(() => AsyncStorage.clear());

describe('history record', () => {
  it('contains every required field and a 13-trick log', () => {
    const game = finishedHand();
    const r = buildRecord(game, players, 'dev-test', 95);
    expect(r).toMatchObject({
      playerName: 'Tester',
      deviceId: 'dev-test',
      bidderSeat: game.result!.bidder,
      bid: game.result!.bid,
      rangSuit: game.result!.rangSuit,
      winnerTeam: game.result!.winnerTeam,
      durationSeconds: 95,
    });
    expect(r.tricksWon.teamA + r.tricksWon.teamB).toBe(13);
    expect(r.trickLog).toHaveLength(13);
    expect(r.trickLog[0].plays).toHaveLength(4);
    expect(typeof r.humanWon).toBe('boolean');
    // Firestore rejects undefined values and nested arrays: the record must be plain JSON.
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('offline queue when Firebase is not configured', () => {
  it('queues the game locally and History still shows it', async () => {
    const status = await saveHandResult(finishedHand(), players, 60);
    expect(status).toBe('offline');
    const res = await fetchHistory();
    expect(res.configured).toBe(false);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].pending).toBe(true);
  });

  it('summarises games for the History header', () => {
    const base = buildRecord(finishedHand(), players, 'd', 10);
    const items = [
      { ...base, id: '1', createdAt: new Date(), pending: false, humanWon: true, bid: 8, bidderSeat: 0 as const },
      { ...base, id: '2', createdAt: new Date(), pending: false, humanWon: false, bid: 10, bidderSeat: 1 as const },
    ];
    expect(summarize(items)).toEqual({ played: 2, winRate: 50, avgBid: 9, asBidder: 1 });
  });
});
