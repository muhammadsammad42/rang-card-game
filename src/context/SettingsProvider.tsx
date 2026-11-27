/**
 * SettingsProvider.tsx — user preferences (name, bot difficulty, bot speed,
 * haptics, reduce animations, hand sort order) and local stats, persisted in AsyncStorage and shared via Context.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { EMPTY_STATS, KEYS, LocalStats, readJSON, writeJSON } from '@/services/storage';

export type Difficulty = 'easy' | 'normal';
export type BotSpeed = 'slow' | 'normal' | 'fast';
/** How the human's hand is ordered on screen. */
export type HandSort = 'suit' | 'rank';

export interface Settings {
  playerName: string;
  difficulty: Difficulty;
  botSpeed: BotSpeed;
  haptics: boolean;
  /** Shorter / fewer animations (also on automatically when the OS "Remove animations" setting is on). */
  reduceMotion: boolean;
  handSort: HandSort;
  /** Emoji reactions on the table (button + floating emojis). */
  reactions: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: 'You',
  difficulty: 'normal',
  botSpeed: 'normal',
  haptics: true,
  reduceMotion: false,
  handSort: 'suit',
  reactions: true,
};

/** Bot "thinking" delay range per speed setting, in milliseconds. */
export const BOT_DELAY: Record<BotSpeed, [number, number]> = {
  slow: [1000, 1400],
  normal: [600, 1000],
  fast: [320, 560],
};

interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  stats: LocalStats;
  /** Records one finished hand in the local stats. */
  recordHand: (entry: { won: boolean; wasBidder: boolean; bid: number | null }) => void;
  resetStats: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<LocalStats>(EMPTY_STATS);
  const [loaded, setLoaded] = useState(false);

  // Load saved values once on start-up.
  useEffect(() => {
    let alive = true;
    Promise.all([readJSON(KEYS.settings, DEFAULT_SETTINGS), readJSON(KEYS.stats, EMPTY_STATS)]).then(([s, st]) => {
      if (!alive) return;
      // Merge with the defaults so settings saved by an older version gain the new keys.
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setStats(st);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeJSON(KEYS.settings, next);
      return next;
    });
  }, []);

  const recordHand = useCallback((entry: { won: boolean; wasBidder: boolean; bid: number | null }) => {
    setStats((prev) => {
      const next: LocalStats = {
        handsPlayed: prev.handsPlayed + 1,
        handsWon: prev.handsWon + (entry.won ? 1 : 0),
        timesBidder: prev.timesBidder + (entry.wasBidder ? 1 : 0),
        bidsMade: prev.bidsMade + (entry.wasBidder && entry.bid ? entry.bid : 0),
      };
      writeJSON(KEYS.stats, next);
      return next;
    });
  }, []);

  const resetStats = useCallback(() => {
    setStats(EMPTY_STATS);
    writeJSON(KEYS.stats, EMPTY_STATS);
  }, []);

  const value = useMemo(
    () => ({ settings, loaded, update, stats, recordHand, resetStats }),
    [settings, loaded, update, stats, recordHand, resetStats],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Like useSettings, but returns null outside the provider (e.g. the crash screen) instead of throwing. */
export function useOptionalSettings(): SettingsContextValue | null {
  return useContext(SettingsContext);
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
