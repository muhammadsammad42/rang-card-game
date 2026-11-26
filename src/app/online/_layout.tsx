/**
 * online/_layout.tsx — the online section (menu → lobby → table).
 *
 * The OnlineRoomProvider lives here, so the room's listeners survive moving
 * between lobby and table, and are all stopped when the player leaves the
 * online section.
 */
import { Stack } from 'expo-router';

import { OnlineRoomProvider } from '@/online/OnlineRoomProvider';
import { colors } from '@/theme/theme';

export default function OnlineLayout() {
  return (
    <OnlineRoomProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade_from_bottom',
          contentStyle: { backgroundColor: colors.night },
        }}>
        <Stack.Screen name="menu" />
        <Stack.Screen name="lobby" options={{ gestureEnabled: false }} />
        <Stack.Screen name="game" options={{ gestureEnabled: false, animation: 'fade' }} />
      </Stack>
    </OnlineRoomProvider>
  );
}
