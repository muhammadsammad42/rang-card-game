/**
 * useMotion.ts — one switch for every animation in the app.
 *
 * Animations are reduced when EITHER the in-app "Reduce animations" setting
 * is on OR the phone's own accessibility setting ("Remove animations") is on
 * (Reanimated's useReducedMotion reads that). Components call `ms(260)` for a
 * duration: it returns 0 when motion is reduced, so the value jumps straight
 * to its end state, and they skip purely decorative loops (pulses, sparkles).
 */
import { useMemo } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { useOptionalSettings } from '@/context/SettingsProvider';

export interface Motion {
  /** True when animations should be minimal. */
  reduced: boolean;
  /** Duration helper: `ms(300)` → 300, or 0 when motion is reduced. */
  ms: (duration: number) => number;
}

export function useMotion(): Motion {
  const system = useReducedMotion();
  const setting = useOptionalSettings()?.settings.reduceMotion ?? false;
  const reduced = system || setting;
  return useMemo(() => ({ reduced, ms: (d: number) => (reduced ? 0 : d) }), [reduced]);
}
