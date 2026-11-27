/**
 * _layout.tsx — root layout for Expo Router.
 *
 * Wraps every screen in the app-wide providers, outermost first:
 *   GestureHandlerRootView → SafeAreaProvider → ErrorBoundary (friendly
 *   "Something went wrong — Restart" screen) → SettingsProvider → ToastProvider
 *   → GameProvider → Stack navigator.
 * Keeping GameProvider here means a match survives navigating Home and back.
 */
import { DarkTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider, useToast } from '@/components/Toast';
import { GameProvider } from '@/context/GameProvider';
import { SettingsProvider } from '@/context/SettingsProvider';
import { useMotion } from '@/hooks/useMotion';
import { flushQueue } from '@/services/historyService';
import { colors } from '@/theme/theme';

/** React Navigation theme tuned to the Midnight Lounge palette. */
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.night,
    card: colors.nightElevated,
    text: colors.ivory,
    primary: colors.gold,
    border: colors.hairline,
  },
};

/** On app start, retry uploading any games saved while offline (non-blocking). */
function StartupSync() {
  const toast = useToast();
  useEffect(() => {
    flushQueue()
      .then((n) => {
        if (n > 0) toast.show(`Synced ${n} saved game${n === 1 ? '' : 's'} to the cloud`, 'success');
      })
      .catch(() => undefined);
  }, [toast]);
  return null;
}

/** The navigator. Screen transitions fade/slide, or switch instantly with "Reduce animations". */
function AppStack() {
  const { reduced } = useMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduced ? 'none' : 'fade_from_bottom',
        contentStyle: { backgroundColor: colors.night },
      }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="game" options={{ gestureEnabled: false, animation: reduced ? 'none' : 'fade' }} />
      <Stack.Screen name="history/index" />
      <Stack.Screen name="history/[id]" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="online" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  // Changing the key remounts every provider, giving a clean slate after a crash.
  const [resetKey, setResetKey] = useState(0);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.night }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style="light" />
          <ErrorBoundary
            onReset={() => {
              setResetKey((k) => k + 1);
              try {
                router.replace('/');
              } catch {
                // navigation not ready yet — the remount alone is enough
              }
            }}>
            <SettingsProvider key={resetKey}>
              <ToastProvider>
                <StartupSync />
                <GameProvider>
                  <AppStack />
                </GameProvider>
              </ToastProvider>
            </SettingsProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
