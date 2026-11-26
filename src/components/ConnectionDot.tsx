/**
 * ConnectionDot.tsx — online status: green when the server has confirmed our
 * view of the room, amber while syncing, red when the device is offline.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, typography } from '@/theme/theme';

export function ConnectionDot({ synced, online, compact }: { synced: boolean; online: boolean; compact?: boolean }) {
  const color = !online ? colors.danger : synced ? colors.success : colors.warning;
  const text = !online ? 'Offline' : synced ? 'Connected' : 'Syncing…';
  return (
    <View style={styles.conn} accessible accessibilityLabel={`Connection: ${text}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      {!compact && <Text style={[typography.caption, { color: colors.textMuted }]}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  conn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
