/**
 * Avatar.tsx — a round medallion with the player's emoji, ringed in their
 * team colour.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import type { PlayerProfile } from '@/game/players';
import { teamOf } from '@/game/rules';
import { colors } from '@/theme/theme';

export function Avatar({ player, size }: { player: PlayerProfile; size: number }) {
  const ring = teamOf(player.seat) === 'A' ? colors.teamA : colors.teamB;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2, borderColor: ring }]}>
      <LinearGradient
        colors={player.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.inner, { borderRadius: size / 2 }]}>
        <Text allowFontScaling={false} style={{ fontSize: size * 0.5 }}>
          {player.avatar}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 2.5, padding: 2, backgroundColor: colors.night },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
