/**
 * online/menu.tsx — the Online menu: Create Room or Join Room (6-character
 * code, validated as you type). Disabled with a clear message when offline or
 * when Firebase is not configured.
 */
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { GlassPanel } from '@/components/GlassPanel';
import { LottieAnim } from '@/components/LottieAnim';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Overlay } from '@/components/Overlay';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useLayout } from '@/hooks/useLayout';
import { useOnline } from '@/online/OnlineRoomProvider';
import { normalizeRoomCode, ROOM_CODE_LENGTH, roomCodeError } from '@/online/roomCode';
import { useSettings } from '@/context/SettingsProvider';
import { colors, gradients, radii, spacing, typography } from '@/theme/theme';

export default function OnlineMenuScreen() {
  const insets = useSafeAreaInsets();
  const { contentWidth } = useLayout();
  const { settings } = useSettings();
  const o = useOnline();
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);

  const codeError = roomCodeError(code);
  const disabledReason = !o.configured
    ? 'Online play needs Firebase, which is not configured in this build.'
    : !o.online
      ? 'Connect to the internet to create or join a room.'
      : null;

  const create = async () => {
    const created = await o.createRoom();
    if (created) router.push('/online/lobby');
  };

  const join = async () => {
    setTouched(true);
    if (codeError) return;
    const ok = await o.joinRoom(normalizeRoomCode(code));
    if (ok) router.push('/online/lobby');
  };

  return (
    <LinearGradient colors={gradients.room} style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, width: contentWidth }}>
        <ScreenHeader title="Play Online" />
        {!o.online && <OfflineBanner />}
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <Text style={[typography.body, styles.lead]}>
            Play with friends on their own phones. 2–4 players — empty seats can be filled with bots.
          </Text>
          <Text style={[typography.caption, styles.muted]}>
            Playing as <Text style={{ color: colors.goldLight }}>{settings.playerName || 'Player'}</Text> (change it in Settings)
          </Text>

          {disabledReason && (
            <GlassPanel style={styles.notice}>
              <Text style={[typography.label, { color: colors.warning }]}>{disabledReason}</Text>
            </GlassPanel>
          )}

          <GlassPanel style={styles.panel}>
            <Text style={[typography.micro, styles.section]}>Host a game</Text>
            <Text style={[typography.caption, styles.muted]}>Create a room and share its code. You run the game on this phone.</Text>
            <AppButton label="Create Room" icon="plus-circle-outline" size="lg" disabled={!!disabledReason || !!o.busy} onPress={create} />
          </GlassPanel>

          <GlassPanel style={styles.panel}>
            <Text style={[typography.micro, styles.section]}>Join a game</Text>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(normalizeRoomCode(t).slice(0, ROOM_CODE_LENGTH))}
              onBlur={() => setTouched(true)}
              onSubmitEditing={join}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={ROOM_CODE_LENGTH + 2}
              placeholder="ROOM CODE"
              placeholderTextColor={colors.textDim}
              returnKeyType="go"
              accessibilityLabel="Room code"
              style={styles.input}
            />
            {touched && codeError && code.length > 0 && <Text style={[typography.caption, { color: colors.danger }]}>{codeError}</Text>}
            <AppButton
              label="Join Room"
              icon="login"
              variant="secondary"
              disabled={!!disabledReason || !!o.busy || code.length === 0}
              onPress={join}
            />
          </GlassPanel>

          {o.error && (
            <View style={styles.error} accessibilityLiveRegion="assertive">
              <Text style={[typography.label, { color: colors.danger }]}>{o.error}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {o.busy && (
        <Overlay maxWidth={300}>
          <View style={styles.busy}>
            <LottieAnim name="loading" style={{ width: 90, height: 90 }} />
            <Text style={[typography.heading, { color: colors.ivory }]}>{o.busy}</Text>
          </View>
        </Overlay>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg },
  lead: { color: colors.ivory },
  muted: { color: colors.textMuted },
  section: { color: colors.gold },
  notice: { padding: spacing.md },
  panel: { gap: spacing.md },
  input: {
    backgroundColor: colors.nightPanel,
    color: colors.ivory,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingVertical: spacing.md,
    fontSize: 26,
    letterSpacing: 8,
    textAlign: 'center',
    fontWeight: '700',
  },
  error: { padding: spacing.md, borderRadius: radii.md, backgroundColor: 'rgba(239,90,95,0.12)' },
  busy: { alignItems: 'center', gap: spacing.sm },
});
