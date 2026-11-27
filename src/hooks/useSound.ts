/**
 * useSound.ts — sound effects for React code.
 *
 *  - useSoundSetup(): mounted once in the root layout: preloads every sound,
 *    keeps the service in sync with Settings (on/off + volume) and releases
 *    the players when the app's root unmounts.
 *  - useSound(): returns the stable `sfx(name)` function.
 *  - useGameSounds(game, mySeat): watches the game state and plays the event
 *    sounds (utils/gameSounds). Shared by single-player and online — online,
 *    each phone plays the sounds for the states it sees; nothing goes to Firestore.
 */
import { useEffect, useRef } from 'react';

import { useSettings } from '@/context/SettingsProvider';
import type { GameState, Seat } from '@/game/types';
import { soundService } from '@/services/soundService';
import { gameSoundsFor } from '@/utils/gameSounds';

const sfx = soundService.play;

export function useSoundSetup() {
  const { settings } = useSettings();
  useEffect(() => {
    soundService.init();
    return () => soundService.release();
  }, []);
  useEffect(() => {
    soundService.configure({ enabled: settings.sound, volume: settings.soundVolume });
  }, [settings.sound, settings.soundVolume]);
}

export const useSound = () => sfx;

export function useGameSounds(game: GameState | null, mySeat: Seat | null) {
  const prev = useRef(game);
  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    for (const name of gameSoundsFor(before, game, mySeat)) sfx(name);
  }, [game, mySeat]);
}
