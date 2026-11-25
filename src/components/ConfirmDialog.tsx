/**
 * ConfirmDialog.tsx — "Are you sure?" dialog used before destructive actions
 * (restart hand/match, quit, reset stats).
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme/theme';

import { AppButton } from './AppButton';
import { Overlay } from './Overlay';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel, danger }: Props) {
  return (
    <Overlay maxWidth={380}>
      <Text style={[typography.title, styles.title]}>{title}</Text>
      <Text style={[typography.body, styles.message]}>{message}</Text>
      <View style={styles.row}>
        <AppButton label="Cancel" variant="secondary" onPress={onCancel} style={styles.flex} />
        <AppButton label={confirmLabel} variant={danger ? 'danger' : 'primary'} onPress={onConfirm} style={styles.flex} />
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ivory, fontSize: 22 },
  message: { color: colors.textMuted, lineHeight: 21 },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flex: { flex: 1 },
});
