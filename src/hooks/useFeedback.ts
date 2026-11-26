/**
 * useFeedback.ts — haptic feedback that respects the Settings toggle.
 * Haptics calls are fire-and-forget; failures (e.g. unsupported device) are ignored.
 * Works outside <SettingsProvider> too (haptics then default to on), so shared
 * components such as AppButton can use it on the crash screen.
 */
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';

import { useOptionalSettings } from '@/context/SettingsProvider';

export function useFeedback() {
  const on = useOptionalSettings()?.settings.haptics ?? true;
  return useMemo(() => {
    const safe = (p: Promise<void>) => p.catch(() => undefined);
    return {
      /** Light tap: selecting a card, pressing a button. */
      tap: () => on && safe(Haptics.selectionAsync()),
      /** Soft impact: a button press (lighter than playing a card). */
      press: () => on && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
      /** Medium impact: playing a card. */
      play: () => on && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
      /** Error buzz: invalid move. */
      error: () => on && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
      /** Success: winning a hand, collecting a pile. */
      success: () => on && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
      /** Warning: Rang revealed. */
      warning: () => on && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
    };
  }, [on]);
}
