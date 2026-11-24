/** HistoryDetail screen — placeholder, implemented in a later milestone. */
import { Text, View } from 'react-native';

import { colors, typography } from '@/theme/theme';

export default function HistoryDetailScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.night }}>
      <Text style={[typography.title, { color: colors.gold }]}>HistoryDetail</Text>
    </View>
  );
}
