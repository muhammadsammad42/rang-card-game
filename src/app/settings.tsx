/**
 * settings.tsx — Settings: player name, bot difficulty, bot speed, haptics,
 * reduce animations, hand sort order, and resetting local stats. Saved automatically to AsyncStorage.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { GlassPanel } from '@/components/GlassPanel';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Segmented } from '@/components/Segmented';
import { useToast } from '@/components/Toast';
import { BotSpeed, Difficulty, HandSort, useSettings } from '@/context/SettingsProvider';
import { useLayout } from '@/hooks/useLayout';
import { colors, gradients, radii, spacing, typography } from '@/theme/theme';

const MAX_NAME = 16;

function SwitchRow({ title, help, value, onChange }: { title: string; help: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={[typography.label, { color: colors.ivory }]}>{title}</Text>
        <Text style={[typography.caption, styles.help]}>{help}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.goldDeep, false: colors.nightPanel }}
        thumbColor={value ? colors.goldLight : colors.textDim}
        accessibilityLabel={title}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { contentWidth } = useLayout();
  const { settings, update, resetStats } = useSettings();
  const toast = useToast();
  const [name, setName] = useState(settings.playerName);
  const [confirmReset, setConfirmReset] = useState(false);

  const saveName = () => {
    const clean = name.trim().slice(0, MAX_NAME) || 'You';
    setName(clean);
    if (clean !== settings.playerName) {
      update({ playerName: clean });
      toast.show('Name saved', 'success');
    }
  };

  return (
    <LinearGradient colors={gradients.room} style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, width: contentWidth }}>
        <ScreenHeader title="Settings" />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
          <GlassPanel style={styles.panel}>
            <Text style={[typography.micro, styles.section]}>Player</Text>
            <Text style={[typography.label, styles.label]}>Your name at the table</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              onSubmitEditing={saveName}
              maxLength={MAX_NAME}
              placeholder="You"
              placeholderTextColor={colors.textDim}
              returnKeyType="done"
              autoCorrect={false}
              accessibilityLabel="Player name"
              style={styles.input}
            />
          </GlassPanel>

          <GlassPanel style={styles.panel}>
            <Text style={[typography.micro, styles.section]}>Bots</Text>
            <Text style={[typography.label, styles.label]}>Difficulty</Text>
            <Segmented<Difficulty>
              accessibilityLabel="Bot difficulty"
              value={settings.difficulty}
              onChange={(difficulty) => update({ difficulty })}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'normal', label: 'Normal' },
              ]}
            />
            <Text style={[typography.caption, styles.help]}>
              {settings.difficulty === 'easy'
                ? 'Easy bots play random legal cards and bid simply.'
                : 'Normal bots evaluate their hands, win tricks cheaply, protect their partner and track played cards.'}
            </Text>
            <Text style={[typography.label, styles.label]}>Speed</Text>
            <Segmented<BotSpeed>
              accessibilityLabel="Bot speed"
              value={settings.botSpeed}
              onChange={(botSpeed) => update({ botSpeed })}
              options={[
                { value: 'slow', label: 'Slow' },
                { value: 'normal', label: 'Normal' },
                { value: 'fast', label: 'Fast' },
              ]}
            />
          </GlassPanel>

          <GlassPanel style={styles.panel}>
            <Text style={[typography.micro, styles.section]}>Feedback and motion</Text>
            <SwitchRow
              title="Haptics"
              help="Vibration when you select or play a card, press a button, make an invalid move or win."
              value={settings.haptics}
              onChange={(haptics) => update({ haptics })}
            />
            <SwitchRow
              title="Reduce animations"
              help="Turns off pulsing glows, sparkles and the deal animation, and makes cards and dialogs appear instantly. Also follows the phone's Remove animations setting."
              value={settings.reduceMotion}
              onChange={(reduceMotion) => update({ reduceMotion })}
            />
            <SwitchRow
              title="Reactions"
              help="Shows the emoji reactions button on the table and the emojis other players and bots send. Off hides both."
              value={settings.reactions}
              onChange={(reactions) => update({ reactions })}
            />
          </GlassPanel>

          <GlassPanel style={styles.panel}>
            <Text style={[typography.micro, styles.section]}>Your hand</Text>
            <Text style={[typography.label, styles.label]}>Sort cards</Text>
            <Segmented<HandSort>
              accessibilityLabel="Sort your hand"
              value={settings.handSort}
              onChange={(handSort) => update({ handSort })}
              options={[
                { value: 'suit', label: 'By suit' },
                { value: 'rank', label: 'By rank' },
              ]}
            />
            <Text style={[typography.caption, styles.help]}>You can also switch with the Sort chip next to your cards during a game.</Text>
          </GlassPanel>

          <GlassPanel style={styles.panel}>
            <Text style={[typography.micro, styles.section]}>Data</Text>
            <Text style={[typography.caption, styles.help]}>
              Clears the hands, win rate and bidding stats shown on the Home screen. Cloud history is not affected.
            </Text>
            <AppButton label="Reset local stats" icon="delete-outline" variant="danger" size="sm" onPress={() => setConfirmReset(true)} />
          </GlassPanel>
        </ScrollView>
      </KeyboardAvoidingView>

      {confirmReset && (
        <ConfirmDialog
          title="Reset local stats?"
          message="Your hands played, win rate and bidding stats on this device will go back to zero."
          confirmLabel="Reset"
          danger
          onCancel={() => setConfirmReset(false)}
          onConfirm={() => {
            resetStats();
            setConfirmReset(false);
            toast.show('Local stats reset', 'success');
          }}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg },
  panel: { gap: spacing.sm },
  section: { color: colors.gold },
  label: { color: colors.ivory, marginTop: spacing.xs },
  help: { color: colors.textMuted },
  input: {
    backgroundColor: colors.nightPanel,
    color: colors.ivory,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
