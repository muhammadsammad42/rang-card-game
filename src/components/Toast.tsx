/**
 * Toast.tsx — small, non-blocking messages that slide in at the top
 * ("Saved to cloud", "Offline — will retry", "West collected 3 tricks").
 * Use `useToast().show(message, kind)` from anywhere inside <ToastProvider>.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, shadows, spacing, typography } from '@/theme/theme';

import { FadeInView } from './FadeInView';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind) => void } | null>(null);

const ACCENT: Record<ToastKind, string> = {
  info: colors.info,
  success: colors.success,
  warning: colors.warning,
  error: colors.danger,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, kind });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <FadeInView
          key={toast.id}
          from="down"
          duration={220}
          pointerEvents="none"
          style={[styles.toast, { top: insets.top + spacing.sm, borderLeftColor: ACCENT[toast.kind] }]}>
          <Text accessibilityLiveRegion="polite" style={[typography.label, { color: colors.ivory }]}>
            {toast.message}
          </Text>
        </FadeInView>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 420,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderLeftWidth: 4,
    zIndex: 1000,
    ...shadows.lg,
  },
});
