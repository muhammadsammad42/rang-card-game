/**
 * storage.ts — thin, crash-proof wrappers around AsyncStorage.
 *
 * Every read falls back to a default and every write swallows errors, so a
 * storage failure can never crash the app. Holds: settings, local stats, the
 * random device id, and the queue of games waiting to be uploaded to Firebase.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  settings: 'rang.settings.v1',
  stats: 'rang.stats.v1',
  deviceId: 'rang.deviceId.v1',
  pendingGames: 'rang.pendingGames.v1',
} as const;

/** Reads JSON from storage, returning `fallback` if missing or unreadable. */
export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Reads a JSON array (no merging with defaults). */
export async function readArray<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-fatal: the app keeps working with in-memory values.
  }
}

/** A random id that identifies this install (no personal data). Created once. */
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(KEYS.deviceId);
    if (existing) return existing;
    const id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    await AsyncStorage.setItem(KEYS.deviceId, id);
    return id;
  } catch {
    return 'dev-unknown';
  }
}

/** Local statistics shown on the Home screen. */
export interface LocalStats {
  handsPlayed: number;
  handsWon: number;
  timesBidder: number;
  bidsMade: number;
}
export const EMPTY_STATS: LocalStats = { handsPlayed: 0, handsWon: 0, timesBidder: 0, bidsMade: 0 };
