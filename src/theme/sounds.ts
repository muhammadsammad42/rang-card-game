/**
 * sounds.ts — the ONLY place that references the sound files in assets/sounds/.
 *
 * The WAVs are synthesised by `node scripts/generate-sounds.js` (sine chimes and
 * filtered-noise card flicks, all < 1 s). To swap one, replace the file keeping
 * its name, or change the require() below.
 */
export const SOUND_FILES = {
  tap: require('../../assets/sounds/tap.wav'),
  select: require('../../assets/sounds/select.wav'),
  play: require('../../assets/sounds/play.wav'),
  invalid: require('../../assets/sounds/invalid.wav'),
  trick: require('../../assets/sounds/trick.wav'),
  pile: require('../../assets/sounds/pile.wav'),
  reveal: require('../../assets/sounds/reveal.wav'),
  bid: require('../../assets/sounds/bid.wav'),
  turn: require('../../assets/sounds/turn.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  deal: require('../../assets/sounds/deal.wav'),
} as const;

export type SoundName = keyof typeof SOUND_FILES;

export type SoundVolume = 'low' | 'medium' | 'high';
export const VOLUME_LEVEL: Record<SoundVolume, number> = { low: 0.35, medium: 0.65, high: 1 };

/** Frequent sounds get 2 players so quick repeats overlap instead of cutting each other off. */
export const SOUND_VOICES: Partial<Record<SoundName, number>> = { tap: 2, select: 2, play: 2, pop: 2 };

/** Minimum gap (ms) between two plays of the same sound — stops spam during fast bot turns. */
export const SOUND_MIN_GAP: Partial<Record<SoundName, number>> = { play: 90, tap: 50, select: 50, bid: 150, trick: 250, turn: 600 };
