/**
 * soundService.ts — short sound effects with expo-audio (works in Expo Go).
 *
 *  - init(): sets the audio mode (respects the iOS silent switch, mixes with
 *    other apps' audio) and preloads one player per sound (two for frequent
 *    ones) so play() starts instantly.
 *  - play(name): restarts a free player from 0. Different sounds overlap;
 *    the same sound is throttled (SOUND_MIN_GAP) so fast bot turns don't spam.
 *  - configure({ enabled, volume }): from Settings. Off → play() does nothing.
 *  - release(): removes every player (root layout unmount).
 *  Every audio call is wrapped: a failing sound never crashes the app
 *  (logged in development only).
 *
 * The audio backend is injected (createSoundService(api)), so tests use a fake.
 */
import { SOUND_FILES, SOUND_MIN_GAP, SOUND_VOICES, type SoundName, type SoundVolume, VOLUME_LEVEL } from '@/theme/sounds';

export interface SoundPlayer {
  volume: number;
  play(): void;
  seekTo(seconds: number): Promise<void>;
  remove(): void;
}

export interface AudioApi {
  createPlayer(source: number): SoundPlayer;
  setAudioMode(): Promise<void>;
}

function warn(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[sound]', ...args);
}

export function createSoundService(getApi: () => AudioApi, now: () => number = Date.now) {
  let enabled = true;
  let volume = VOLUME_LEVEL.medium;
  let players: Partial<Record<SoundName, SoundPlayer[]>> | null = null;
  const next: Partial<Record<SoundName, number>> = {};
  const lastAt: Partial<Record<SoundName, number>> = {};

  function init() {
    if (players) return;
    players = {};
    let api: AudioApi;
    try {
      api = getApi();
    } catch (e) {
      warn('audio unavailable', e);
      return;
    }
    api.setAudioMode().catch((e) => warn('audio mode', e));
    for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
      try {
        players[name] = Array.from({ length: SOUND_VOICES[name] ?? 1 }, () => api.createPlayer(SOUND_FILES[name] as number));
      } catch (e) {
        warn('could not load', name, e);
      }
    }
  }

  function play(name: SoundName) {
    if (!enabled) return;
    const t = now();
    const gap = SOUND_MIN_GAP[name] ?? 0;
    if (lastAt[name] !== undefined && t - (lastAt[name] as number) < gap) return;
    if (!players) init();
    const list = players?.[name];
    if (!list || list.length === 0) return;
    lastAt[name] = t;
    const i = next[name] ?? 0;
    next[name] = (i + 1) % list.length;
    const p = list[i];
    try {
      p.volume = volume;
      p.seekTo(0)
        .catch(() => undefined)
        .then(() => {
          try {
            p.play();
          } catch (e) {
            warn('play', name, e);
          }
        });
    } catch (e) {
      warn('play', name, e);
    }
  }

  function configure(opts: { enabled: boolean; volume: SoundVolume }) {
    enabled = opts.enabled;
    volume = VOLUME_LEVEL[opts.volume] ?? VOLUME_LEVEL.medium;
  }

  function release() {
    if (!players) return;
    for (const list of Object.values(players)) {
      for (const p of list ?? []) {
        try {
          p.remove();
        } catch (e) {
          warn('release', e);
        }
      }
    }
    players = null;
  }

  return { init, play, configure, release };
}

/** The real backend. Loaded lazily so tests and the web bundle never touch native audio before init(). */
function expoAudioApi(): AudioApi {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const audio = require('expo-audio') as typeof import('expo-audio');
  return {
    createPlayer: (source) => audio.createAudioPlayer(source) as unknown as SoundPlayer,
    setAudioMode: () => audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }),
  };
}

export const soundService = createSoundService(expoAudioApi);
