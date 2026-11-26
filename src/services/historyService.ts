/**
 * historyService.ts — game history in Cloud Firestore (`games` collection).
 *
 * Saving: at the end of every hand GameProvider calls `saveHandResult`. The
 * record gets a deterministic id (deviceId + timestamp) so retries can never
 * create duplicates. If Firebase is not configured, offline, or slow, the
 * record goes into a local AsyncStorage queue that `flushQueue` uploads on the
 * next app start or when the History screen opens.
 *
 * Reading: `fetchHistory` loads this device's games (a simple equality query,
 * so no Firestore index is needed) and merges in any still-queued games.
 */
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';

import { cardShort } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import { teamOf } from '@/game/rules';
import type { GameState, Seat, Suit, Team, TrickRecord } from '@/game/types';

import { getDb, isFirebaseConfigured } from './firebase';
import { getDeviceId, KEYS, readArray, writeJSON } from './storage';

export type SaveStatus = 'saved' | 'queued' | 'offline';

const COLLECTION = 'games';
const NETWORK_TIMEOUT_MS = 8000;
const MAX_QUEUE = 200;

/** One trick in the compact log stored with each game. */
export interface TrickLogEntry {
  n: number;
  leader: Seat;
  /** Cards in play order, e.g. [{ seat: 1, card: "A♥" }, …]. */
  plays: { seat: Seat; card: string }[];
  winner: Seat;
  trump: boolean;
  /** "team-A" | "team-B" | "pile" | "collected-A" | "collected-B" (+ count / leftover flag). */
  result: string;
  count?: number;
  leftover?: boolean;
}

/** The document saved for every finished hand. */
/** Extra fields saved for online games (absent on single-player records). */
export interface OnlineRecordInfo {
  mode: 'online';
  roomCode: string;
  /** Seats (from this player's point of view, 0 = me) that were played by bots. */
  botSeats: number[];
}

export interface GameRecord extends Partial<OnlineRecordInfo> {
  playerName: string;
  deviceId: string;
  /** Milliseconds since epoch on the device (used for sorting; queued games keep their real time). */
  clientCreatedAt: number;
  handNumber: number;
  dealerSeat: Seat;
  bidderSeat: Seat;
  bidderName: string;
  bidderTeam: Team;
  bid: number;
  forcedBid: boolean;
  rangSuit: Suit;
  revealedAtTrick: number | null;
  revealedBy: Seat | null;
  revealedByName: string | null;
  tricksWon: { teamA: number; teamB: number };
  winnerTeam: Team;
  humanWon: boolean;
  durationSeconds: number;
  playerNames: string[];
  trickLog: TrickLogEntry[];
}

/** A game as shown in the History screens. */
export interface HistoryItem extends GameRecord {
  id: string;
  createdAt: Date;
  /** True if it only exists in the local queue (not yet in the cloud). */
  pending: boolean;
}

interface QueuedGame {
  id: string;
  record: GameRecord;
}

/** Rejects if `p` takes longer than `ms` (Firestore waits forever when offline). */
function withTimeout<T>(p: Promise<T>, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function logEntry(t: TrickRecord): TrickLogEntry {
  const base = {
    n: t.number,
    leader: t.leader,
    plays: t.plays.map((p) => ({ seat: p.seat, card: cardShort(p.card) })),
    winner: t.winner,
    trump: t.trumpActive,
  };
  switch (t.outcome.type) {
    case 'team':
      return { ...base, result: `team-${t.outcome.team}` };
    case 'pile':
      return { ...base, result: 'pile', count: t.outcome.pileSize };
    case 'collected':
      return { ...base, result: `collected-${t.outcome.team}`, count: t.outcome.count, leftover: !!t.outcome.leftover };
  }
}

/** Builds the Firestore record for a finished hand. */
export function buildRecord(
  game: GameState,
  players: PlayerProfile[],
  deviceId: string,
  durationSeconds: number,
  online: OnlineRecordInfo | null = null,
): GameRecord {
  const r = game.result!;
  return {
    playerName: players[0].name,
    deviceId,
    clientCreatedAt: Date.now(),
    handNumber: game.handNumber,
    dealerSeat: game.dealer,
    bidderSeat: r.bidder,
    bidderName: players[r.bidder].name,
    bidderTeam: r.biddingTeam,
    bid: r.bid,
    forcedBid: r.forcedBid,
    rangSuit: r.rangSuit,
    revealedAtTrick: r.revealedAtTrick,
    revealedBy: r.revealedBy,
    revealedByName: r.revealedBy !== null ? players[r.revealedBy].name : null,
    tricksWon: { teamA: r.tricksWon.A, teamB: r.tricksWon.B },
    winnerTeam: r.winnerTeam,
    humanWon: r.winnerTeam === teamOf(0),
    durationSeconds,
    playerNames: players.map((p) => p.name),
    trickLog: game.completedTricks.map(logEntry),
    ...(online ?? {}),
  };
}

async function readQueue(): Promise<QueuedGame[]> {
  return readArray<QueuedGame>(KEYS.pendingGames);
}

async function enqueue(item: QueuedGame): Promise<void> {
  const queue = (await readQueue()).filter((q) => q.id !== item.id);
  queue.push(item);
  await writeJSON(KEYS.pendingGames, queue.slice(-MAX_QUEUE));
}

/** Writes one record to Firestore (idempotent thanks to the fixed id). */
async function upload(id: string, record: GameRecord): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('not-configured');
  await withTimeout(setDoc(doc(db, COLLECTION, id), { ...record, createdAt: serverTimestamp() }));
}

/** Saves a finished hand: to the cloud if possible, otherwise to the local queue. */
export async function saveHandResult(
  game: GameState,
  players: PlayerProfile[],
  durationSeconds: number,
  online: OnlineRecordInfo | null = null,
): Promise<SaveStatus> {
  if (!game.result) return 'offline';
  const deviceId = await getDeviceId();
  const record = buildRecord(game, players, deviceId, durationSeconds, online);
  const id = `${deviceId}-${record.clientCreatedAt}`;
  if (!isFirebaseConfigured) {
    await enqueue({ id, record });
    return 'offline';
  }
  try {
    await upload(id, record);
    return 'saved';
  } catch {
    await enqueue({ id, record });
    return 'queued';
  }
}

/** True if a game document with this id is already in Firestore (false on any error). */
async function existsInCloud(id: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    return (await withTimeout(getDoc(doc(db, COLLECTION, id)))).exists();
  } catch {
    return false;
  }
}

/** Retries every queued game. Returns how many were uploaded. Safe to call any time. */
let flushing: Promise<number> | null = null;
export function flushQueue(): Promise<number> {
  if (!isFirebaseConfigured) return Promise.resolve(0);
  if (flushing) return flushing;
  flushing = (async () => {
    const queue = await readQueue();
    let uploaded = 0;
    const remaining: QueuedGame[] = [];
    for (const item of queue) {
      try {
        await upload(item.id, item.record);
        uploaded++;
      } catch {
        // A save that "timed out" may still have reached the server. If the
        // document already exists, the security rules reject the overwrite —
        // so check for it before keeping the game in the queue.
        if (await existsInCloud(item.id)) uploaded++;
        else remaining.push(item);
      }
    }
    // Keep anything queued while we were uploading.
    const latest = await readQueue();
    const doneIds = new Set(queue.filter((q) => !remaining.includes(q)).map((q) => q.id));
    await writeJSON(
      KEYS.pendingGames,
      latest.filter((q) => !doneIds.has(q.id)),
    );
    return uploaded;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

function toDate(value: unknown, fallbackMs: number): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === 'object' && 'seconds' in value) return new Date((value as { seconds: number }).seconds * 1000);
  return new Date(fallbackMs);
}

function fromQueue(q: QueuedGame): HistoryItem {
  return { ...q.record, id: q.id, createdAt: new Date(q.record.clientCreatedAt), pending: true };
}

export interface HistoryResult {
  items: HistoryItem[];
  configured: boolean;
  /** Set when the cloud could not be reached (local items are still returned). */
  error: string | null;
}

/** Loads this device's games (cloud + still-queued), newest first. */
export async function fetchHistory(): Promise<HistoryResult> {
  const queued = (await readQueue()).map(fromQueue);
  const db = getDb();
  if (!db) return { items: sortNewest(queued), configured: false, error: null };
  try {
    await flushQueue().catch(() => 0);
    const deviceId = await getDeviceId();
    const snap = await withTimeout(getDocs(query(collection(db, COLLECTION), where('deviceId', '==', deviceId), limit(200))));
    const cloud: HistoryItem[] = snap.docs.map((d) => {
      const data = d.data() as GameRecord & { createdAt?: unknown };
      return { ...data, id: d.id, createdAt: toDate(data.createdAt, data.clientCreatedAt), pending: false };
    });
    const cloudIds = new Set(cloud.map((c) => c.id));
    const stillQueued = (await readQueue()).map(fromQueue).filter((q) => !cloudIds.has(q.id));
    return { items: sortNewest([...cloud, ...stillQueued]), configured: true, error: null };
  } catch (e) {
    const message = (e as Error).message === 'timeout' ? 'The cloud is not reachable right now.' : 'Could not load cloud history.';
    return { items: sortNewest(queued), configured: true, error: message };
  }
}

/** Games from the last fetchHistory(), so opening a detail screen is instant. */
const cache = new Map<string, HistoryItem>();

/** Loads one game by id (cache, then the local queue, then the cloud). */
export async function fetchGame(id: string): Promise<HistoryItem | null> {
  const cached = cache.get(id);
  if (cached) return cached;
  const local = (await readQueue()).find((q) => q.id === id);
  if (local) return fromQueue(local);
  const db = getDb();
  if (!db) return null;
  const snap = await withTimeout(getDoc(doc(db, COLLECTION, id)));
  if (!snap.exists()) return null;
  const data = snap.data() as GameRecord & { createdAt?: unknown };
  return { ...data, id: snap.id, createdAt: toDate(data.createdAt, data.clientCreatedAt), pending: false };
}

const sortNewest = (items: HistoryItem[]) => {
  const sorted = items.slice().sort((a, b) => b.clientCreatedAt - a.clientCreatedAt);
  for (const item of sorted) cache.set(item.id, item);
  return sorted;
};

/** Summary numbers for the top of the History screen. */
export function summarize(items: HistoryItem[]) {
  const played = items.length;
  const won = items.filter((g) => g.humanWon).length;
  const asBidder = items.filter((g) => g.bidderSeat === 0).length;
  const avgBid = played > 0 ? items.reduce((s, g) => s + g.bid, 0) / played : 0;
  return { played, winRate: played > 0 ? Math.round((won / played) * 100) : 0, avgBid, asBidder };
}
