/**
 * index.tsx — the Home screen: logo + ambient LottieFiles animation, Continue
 * / New Game / History / Settings, and a summary of local stats.
 */
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { FadeInView } from '@/components/FadeInView';
import { GlassPanel } from '@/components/GlassPanel';
import { LottieAnim } from '@/components/LottieAnim';
import { SuitIcon } from '@/components/SuitIcon';
import { useGame } from '@/context/GameProvider';
import { useSettings } from '@/context/SettingsProvider';
import { useLayout } from '@/hooks/useLayout';
import { colors, gradients, spacing, typography } from '@/theme/theme';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[typography.title, { color: colors.ivory }]}>{value}</Text>
      <Text style={[typography.micro, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { contentWidth, compact } = useLayout();
  const { game, startNewMatch } = useGame();
  const { stats, settings } = useSettings();

  const winRate = stats.handsPlayed > 0 ? `${Math.round((stats.handsWon / stats.handsPlayed) * 100)}%` : '—';
  const avgBid = stats.timesBidder > 0 ? (stats.bidsMade / stats.timesBidder).toFixed(1) : '—';
  const animSize = Math.min(contentWidth * 0.62, compact ? 190 : 260);

  const newGame = () => {
    startNewMatch();
    router.push('/game');
  };

  return (
    <LinearGradient colors={gradients.room} style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl, width: contentWidth },
        ]}
        showsVerticalScrollIndicator={false}>
        <FadeInView from="down" duration={500} style={styles.hero}>
          <LottieAnim name="homeCards" style={{ width: animSize, height: animSize * 0.74 }} />
          <View style={styles.suits}>
            {(['S', 'H', 'C', 'D'] as const).map((s) => (
              <SuitIcon key={s} suit={s} size={16} color={s === 'H' || s === 'D' ? '#E0606C' : colors.gold} />
            ))}
          </View>
          <Text style={[typography.display, styles.logo]} accessibilityRole="header">
            RANG
          </Text>
          <Text style={[typography.body, styles.tagline]}>The hidden-trump card game for four</Text>
        </FadeInView>

        <FadeInView from="up" delay={150} duration={450} style={styles.buttons}>
          {game && game.phase !== 'HAND_OVER' ? (
            <>
              <AppButton label={`Continue · Hand ${game.handNumber}`} icon="play" size="lg" onPress={() => router.push('/game')} />
              <AppButton label="New Game" icon="cards-playing-outline" variant="secondary" onPress={newGame} />
            </>
          ) : game ? (
            <>
              <AppButton label="Back to the table" icon="play" size="lg" onPress={() => router.push('/game')} />
              <AppButton label="New Game" icon="cards-playing-outline" variant="secondary" onPress={newGame} />
            </>
          ) : (
            <AppButton label="New Game" icon="cards-playing-outline" size="lg" onPress={newGame} />
          )}
          <View style={styles.row}>
            <AppButton label="History" icon="history" variant="secondary" onPress={() => router.push('/history')} style={styles.flex} />
            <AppButton label="Settings" icon="cog-outline" variant="secondary" onPress={() => router.push('/settings')} style={styles.flex} />
          </View>
        </FadeInView>

        <FadeInView from="up" delay={300} duration={450}>
          <GlassPanel style={styles.stats}>
            <Text style={[typography.micro, { color: colors.gold }]}>Your table record</Text>
            <View style={styles.statRow}>
              <Stat label="Hands" value={String(stats.handsPlayed)} />
              <Stat label="Win rate" value={winRate} />
              <Stat label="As bidder" value={String(stats.timesBidder)} />
              <Stat label="Avg bid" value={avgBid} />
            </View>
            <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
              Playing as {settings.playerName} · {settings.difficulty === 'easy' ? 'Easy' : 'Normal'} bots
            </Text>
          </GlassPanel>
        </FadeInView>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  content: { paddingHorizontal: spacing.xl, gap: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center' },
  suits: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  logo: { color: colors.goldLight, fontSize: 56, letterSpacing: 14, marginTop: spacing.sm, textShadowColor: colors.goldGlow, textShadowRadius: 18 },
  tagline: { color: colors.textMuted, marginTop: spacing.xs },
  buttons: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  stats: { gap: spacing.md },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
});
