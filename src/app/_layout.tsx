/**
 * _layout.tsx — root layout for Expo Router.
 *
 * Wraps every screen in the app-wide providers (gesture handler, safe area,
 * navigation theme) and declares the Stack navigator with our dark theme.
 */
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.night }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade_from_bottom',
              contentStyle: { backgroundColor: colors.night },
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="game" options={{ gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="history/index" />
            <Stack.Screen name="history/[id]" />
            <Stack.Screen name="settings" />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
