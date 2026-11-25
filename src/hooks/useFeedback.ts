/**
 * useFeedback.ts — haptic feedback that respects the Settings toggle.
 * Haptics calls are fire-and-forget; failures (e.g. unsupported device) are ignored.
 */
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';

import { useSettings } from '@/context/SettingsProvider';

export function useFeedback() {
  const { settings } = useSettings();
  return useMemo(() => {
    const on = settings.haptics;
    const safe = (p: Promise<void>) => p.catch(() => undefined);
    return {
      /** Light tap: selecting a card, pressing a button. */
      tap: () => on && safe(Haptics.selectionAsync()),
      /** Medium impact: playing a card. */
      play: () => on && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
      /** Error buzz: invalid move. */
      error: () => on && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
      /** Success: winning a hand, collecting a pile. */
      success: () => on && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
      /** Warning: Rang revealed. */
      warning: () => on && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
    };
  }, [settings.haptics]);
}
