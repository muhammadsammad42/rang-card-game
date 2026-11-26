/// <reference types="node" />
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories and env-dependent module loading need require() */
/**
 * firebase.integration.test.ts — OPT-IN test against the real Firestore project in `.env`.
 *
 * Skipped by default (so `npm test` works offline). Run it with:
 *   RUN_FIREBASE_IT=1 npx jest firebase.integration      (macOS/Linux/Git Bash)
 *   set RUN_FIREBASE_IT=1 && npx jest firebase.integration   (Windows cmd)
 *
 * It exercises the exact code the app uses: saveHandResult → the History query
 * (fetchHistory) → the History Detail load (fetchGame), plus uploading a game
 * that was queued while offline (flushQueue).
 */
import fs from 'fs';
import path from 'path';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const RUN = process.env.RUN_FIREBASE_IT === '1';
const describeIf = RUN ? describe : describe.skip;

/** Loads EXPO_PUBLIC_* values from .env into process.env (Expo does this for the app). */
function loadEnv() {
  const file = path.join(__dirname, '../../../.env');
  if (!fs.existsSync(file)) throw new Error('.env not found');
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(EXPO_PUBLIC_[A-Z_]+)\s*=\s*(.+)\s*$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
}

describeIf('Firestore round trip (live project)', () => {
  jest.setTimeout(60000);

  // Modules are required after the env is loaded (firebase.ts reads it at import time).
  let svc: typeof import('../historyService');
  let fb: typeof import('../firebase');
  let storage: typeof import('../storage');
  let engine: typeof import('@/game/engine');
  let helpers: typeof import('@/game/__tests__/helpers');
  let players: ReturnType<typeof import('@/game/players').getPlayers>;

  beforeAll(() => {
    loadEnv();
    fb = require('../firebase');
    svc = require('../historyService');
    storage = require('../storage');
    engine = require('@/game/engine');
    helpers = require('@/game/__tests__/helpers');
    players = require('@/game/players').getPlayers('Integration Test');
  });

  // Close the Firestore connection so Jest can exit cleanly.
  afterAll(async () => {
    const db = fb?.getDb();
    if (db) await require('firebase/firestore').terminate(db);
  });

  it('is configured and connects to the (default) database', () => {
    expect(fb.isFirebaseConfigured).toBe(true);
    const db = fb.getDb();
    expect(db).not.toBeNull();
    // Firestore exposes the database id it is bound to.
    const databaseId = (db as unknown as { _databaseId: { database: string; projectId: string } })._databaseId;
    expect(databaseId.database).toBe('(default)');
    expect(databaseId.projectId).toBe(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);
  });

  it('saves a finished hand and loads it back like the History screens do', async () => {
    const game = helpers.playRandomHand(engine.createMatch(4242), 7);
    const status = await svc.saveHandResult(game, players, 123);
    expect(status).toBe('saved');

    const res = await svc.fetchHistory();
    expect(res.configured).toBe(true);
    expect(res.error).toBeNull();
    const mine = res.items.find((g) => !g.pending && g.durationSeconds === 123);
    expect(mine).toBeDefined();
    expect(mine!.trickLog).toHaveLength(13);
    expect(mine!.createdAt instanceof Date).toBe(true);

    const detail = await svc.fetchGame(mine!.id);
    expect(detail?.bid).toBe(game.result!.bid);
    expect(detail?.rangSuit).toBe(game.result!.rangSuit);
  });

  it('uploads games that were queued while offline', async () => {
    const deviceId = await storage.getDeviceId();
    const game = helpers.playRandomHand(engine.createMatch(777), 3);
    const record = svc.buildRecord(game, players, deviceId, 456);
    const id = `${deviceId}-${record.clientCreatedAt}`;
    await storage.writeJSON(storage.KEYS.pendingGames, [{ id, record }]);

    const uploaded = await svc.flushQueue();
    expect(uploaded).toBe(1);
    expect(await storage.readArray(storage.KEYS.pendingGames)).toHaveLength(0);

    const res = await svc.fetchHistory();
    const synced = res.items.find((g) => g.id === id);
    expect(synced?.pending).toBe(false);
  });
});
