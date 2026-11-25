/**
 * history/[id].tsx — History Detail: the full summary of one saved hand and
 * its trick-by-trick log (cards played, winner, and whether the trick went to
 * a team, into the middle pile, or collected the pile).
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { GlassPanel } from '@/components/GlassPanel';
import { LottieAnim } from '@/components/LottieAnim';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SuitIcon, suitColorOnDark } from '@/components/SuitIcon';
import { SUIT_NAMES } from '@/game/deck';
import type { Seat } from '@/game/types';
import { useLayout } from '@/hooks/useLayout';
import { fetchGame, HistoryItem, TrickLogEntry } from '@/services/historyService';
import { colors, gradients, radii, spacing, typography } from '@/theme/theme';
import { formatDate, formatDuration, teamLabel } from '@/utils/format';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={[typography.label, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

/** Plain-English result of one logged trick. */
function trickResult(t: TrickLogEntry): { text: string; color: string } {
  if (t.result === 'pile') return { text: `To the middle pile (${t.count ?? '?'})`, color: colors.textMuted };
  if (t.result.startsWith('collected-')) {
    const team = t.result.endsWith('A') ? 'A' : 'B';
    return {
      text: t.leftover ? `Leftover ${t.count} → ${teamLabel(team).toLowerCase()}` : `Collected ${t.count} → ${teamLabel(team).toLowerCase()}`,
      color: team === 'A' ? colors.teamA : colors.teamB,
    };
  }
  const team = t.result.endsWith('A') ? 'A' : 'B';
  return { text: `→ ${teamLabel(team).toLowerCase()}`, color: team === 'A' ? colors.teamA : colors.teamB };
}

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useLayout();
  const [game, setGame] = useState<HistoryItem | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const g = await fetchGame(String(id));
      setGame(g);
      setState(g ? 'ready' : 'missing');
    } catch {
      setState('error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const name = (seat: Seat) => game?.playerNames?.[seat] ?? `Seat ${seat}`;

  return (
    <LinearGradient colors={gradients.room} style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={{ flex: 1, width: contentWidth }}>
        <ScreenHeader title="Hand details" />
        {state === 'loading' && (
          <View style={styles.center}>
            <LottieAnim name="loading" style={{ width: 110, height: 110 }} />
          </View>
        )}
        {(state === 'missing' || state === 'error') && (
          <View style={styles.center}>
            <MaterialCommunityIcons name="cards-outline" size={52} color={colors.textDim} />
            <Text style={[typography.heading, { color: colors.ivory }]}>
              {state === 'missing' ? 'Game not found' : 'Could not load this game'}
            </Text>
            <AppButton label="Retry" icon="refresh" onPress={load} />
          </View>
        )}
        {state === 'ready' && game && (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
            <GlassPanel style={styles.hero}>
              <Text style={[typography.display, { fontSize: 32, color: game.humanWon ? colors.goldLight : colors.ivory }]}>
                {game.humanWon ? 'Won' : 'Lost'}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {formatDate(game.createdAt)} · Hand {game.handNumber} · {formatDuration(game.durationSeconds)}
                {game.pending ? ' · not synced yet' : ''}
              </Text>
              <View style={styles.score}>
                <Text style={[typography.title, { color: colors.teamA }]}>{game.tricksWon.teamA}</Text>
                <Text style={[typography.title, { color: colors.textDim }]}>–</Text>
                <Text style={[typography.title, { color: colors.teamB }]}>{game.tricksWon.teamB}</Text>
              </View>
              <Text style={[typography.caption, { color: colors.textMuted }]}>Your team – Opponents (tricks)</Text>
            </GlassPanel>

            <GlassPanel style={{ gap: spacing.sm }}>
              <Row label="Bidder">
                <MaterialCommunityIcons name="crown" size={16} color={colors.goldLight} />
                <Text style={styles.value}>
                  {game.bidderName} · {teamLabel(game.bidderTeam)}
                </Text>
              </Row>
              <Row label="Bid">
                <Text style={styles.value}>
                  {game.bid}
                  {game.forcedBid ? ' (all passed)' : ''}
                </Text>
              </Row>
              <Row label="Rang">
                <SuitIcon suit={game.rangSuit} size={16} color={suitColorOnDark(game.rangSuit)} />
                <Text style={styles.value}>{SUIT_NAMES[game.rangSuit]}</Text>
              </Row>
              <Row label="Revealed">
                <Text style={styles.value}>
                  {game.revealedAtTrick ? `Trick ${game.revealedAtTrick} by ${game.revealedByName ?? '—'}` : 'Never'}
                </Text>
              </Row>
              <Row label="Dealer">
                <Text style={styles.value}>{name(game.dealerSeat)}</Text>
              </Row>
              <Row label="Winner">
                <Text style={[styles.value, { color: game.winnerTeam === 'A' ? colors.teamA : colors.teamB }]}>{teamLabel(game.winnerTeam)}</Text>
              </Row>
            </GlassPanel>

            <Text style={[typography.micro, { color: colors.gold, marginTop: spacing.sm }]}>Trick by trick</Text>
            {(game.trickLog ?? []).map((t) => {
              const res = trickResult(t);
              return (
                <View key={t.n} style={[styles.trick, game.revealedAtTrick === t.n && styles.revealTrick]}>
                  <View style={styles.trickHead}>
                    <Text style={[typography.label, { color: colors.ivory }]}>
                      #{t.n}
                      {t.trump ? <Text style={{ color: colors.gold }}>  trump</Text> : null}
                    </Text>
                    <Text style={[typography.caption, { color: res.color }]}>{res.text}</Text>
                  </View>
                  <View style={styles.plays}>
                    {t.plays.map((p) => (
                      <Text
                        key={`${t.n}-${p.seat}`}
                        style={[typography.caption, styles.play, p.seat === t.winner && styles.winner]}
                        numberOfLines={1}>
                        {name(p.seat)}: {p.card}
                      </Text>
                    ))}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  content: { padding: spacing.lg, gap: spacing.md },
  hero: { alignItems: 'center', gap: spacing.xs },
  score: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  value: { ...typography.body, color: colors.ivory },
  trick: { backgroundColor: colors.glass, borderRadius: radii.md, padding: spacing.md, gap: spacing.xs, borderWidth: 1, borderColor: colors.hairline },
  revealTrick: { borderColor: colors.gold },
  trickHead: { flexDirection: 'row', justifyContent: 'space-between' },
  plays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  play: { color: colors.textMuted, backgroundColor: colors.nightPanel, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.sm },
  winner: { color: colors.textOnGold, backgroundColor: colors.gold },
});
