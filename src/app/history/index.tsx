/**
 * history/index.tsx — the History screen (bonus).
 *
 * Lists this device's finished hands from Cloud Firestore (plus any games
 * still waiting in the offline queue), newest first, with summary stats at
 * the top. Has a LottieFiles loading state, pull-to-refresh, an empty state,
 * an error state with Retry, and a notice when Firebase isn't configured.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { FadeInView } from '@/components/FadeInView';
import { GlassPanel } from '@/components/GlassPanel';
import { LottieAnim } from '@/components/LottieAnim';
import { PressableScale } from '@/components/PressableScale';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SuitIcon, suitColorOnDark } from '@/components/SuitIcon';
import { SUIT_NAMES } from '@/game/deck';
import { useLayout } from '@/hooks/useLayout';
import { fetchHistory, HistoryItem, summarize } from '@/services/historyService';
import { colors, gradients, radii, spacing, typography } from '@/theme/theme';
import { formatDate } from '@/utils/format';

type LoadState = 'loading' | 'ready' | 'error';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[typography.title, { color: colors.ivory, fontSize: 22 }]}>{value}</Text>
      <Text style={[typography.micro, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function GameRow({ item, index }: { item: HistoryItem; index: number }) {
  const label = `${item.mode === 'online' ? 'Online game. ' : ''}${item.humanWon ? 'Won' : 'Lost'}. ${formatDate(item.createdAt)}. Bid ${item.bid} by ${item.bidderName}. Rang ${SUIT_NAMES[item.rangSuit]}. Tricks ${item.tricksWon.teamA} to ${item.tricksWon.teamB}.`;
  return (
    <FadeInView from="up" distance={12} delay={Math.min(index, 8) * 40}>
      <PressableScale
        onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
        haptic="tap"
        scaleTo={0.97}
        accessibilityLabel={label}
        accessibilityHint="Opens the trick-by-trick details"
        contentStyle={styles.row}>
        <View style={[styles.badge, { backgroundColor: item.humanWon ? 'rgba(61,214,140,0.18)' : 'rgba(239,90,95,0.18)' }]}>
          <Text style={[typography.micro, { color: item.humanWon ? colors.success : colors.danger }]}>{item.humanWon ? 'Won' : 'Lost'}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typography.label, { color: colors.ivory }]}>
            Bid {item.bid} · {item.bidderName}
            {item.pending ? <Text style={{ color: colors.warning }}>  · not synced</Text> : null}
          </Text>
          <View style={styles.metaLine}>
            {item.mode === 'online' && (
              <View style={styles.onlineBadge} accessibilityLabel={`Online game, room ${item.roomCode}`}>
                <Text style={[typography.micro, { color: colors.info }]}>Online</Text>
              </View>
            )}
            <Text style={[typography.caption, { color: colors.textMuted }]}>{formatDate(item.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <SuitIcon suit={item.rangSuit} size={18} color={suitColorOnDark(item.rangSuit)} />
          <Text style={[typography.heading, { color: colors.ivory }]}>
            <Text style={{ color: colors.teamA }}>{item.tricksWon.teamA}</Text>
            <Text style={{ color: colors.textDim }}>–</Text>
            <Text style={{ color: colors.teamB }}>{item.tricksWon.teamB}</Text>
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textDim} />
        </View>
      </PressableScale>
    </FadeInView>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { contentWidth } = useLayout();
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'initial') setState('loading');
    else setRefreshing(true);
    try {
      const res = await fetchHistory();
      if (!alive.current) return;
      setItems(res.items);
      setConfigured(res.configured);
      setError(res.error);
      setState(res.error && res.items.length === 0 ? 'error' : 'ready');
    } catch {
      if (!alive.current) return;
      setError('Could not load history.');
      setState('error');
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, []);

  // Reload each time the screen is shown (also retries the offline queue).
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      load('initial');
      return () => {
        alive.current = false;
      };
    }, [load]),
  );

  const s = summarize(items);

  const header = (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      {!configured && (
        <GlassPanel style={styles.notice}>
          <MaterialCommunityIcons name="cloud-off-outline" size={22} color={colors.warning} />
          <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>
            Cloud history isn&apos;t configured yet (add your Firebase keys to .env). Games played on this device are kept locally and
            will upload once it is set up.
          </Text>
        </GlassPanel>
      )}
      {configured && error && items.length > 0 && (
        <GlassPanel style={styles.notice}>
          <MaterialCommunityIcons name="wifi-off" size={22} color={colors.warning} />
          <Text style={[typography.caption, { color: colors.textMuted, flex: 1 }]}>{error} Showing games saved on this device.</Text>
        </GlassPanel>
      )}
      {items.length > 0 && (
        <GlassPanel style={styles.summary}>
          <Stat label="Played" value={String(s.played)} />
          <Stat label="Win %" value={`${s.winRate}%`} />
          <Stat label="Avg bid" value={s.avgBid.toFixed(1)} />
          <Stat label="As bidder" value={String(s.asBidder)} />
        </GlassPanel>
      )}
    </View>
  );

  return (
    <LinearGradient colors={gradients.room} style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={{ flex: 1, width: contentWidth }}>
        <ScreenHeader title="History" />
        {state === 'loading' ? (
          <View style={styles.center} accessibilityLabel="Loading history">
            <LottieAnim name="loading" style={{ width: 120, height: 120 }} />
            <Text style={[typography.body, { color: colors.textMuted }]}>Shuffling through your games…</Text>
          </View>
        ) : state === 'error' ? (
          <View style={styles.center}>
            <MaterialCommunityIcons name="cloud-alert" size={56} color={colors.danger} />
            <Text style={[typography.heading, { color: colors.ivory }]}>Couldn&apos;t load history</Text>
            <Text style={[typography.body, styles.centerText]}>{error}</Text>
            <AppButton label="Retry" icon="refresh" onPress={() => load('initial')} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(g) => g.id}
            renderItem={({ item, index }) => <GameRow item={item} index={index} />}
            ListHeaderComponent={header}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={colors.gold} colors={[colors.gold]} />
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <MaterialCommunityIcons name="cards-playing-outline" size={56} color={colors.goldDeep} />
                <Text style={[typography.heading, { color: colors.ivory }]}>No games yet</Text>
                <Text style={[typography.body, styles.centerText]}>Finish a hand and it will appear here.</Text>
                <AppButton label="Play now" icon="play" onPress={() => router.replace('/game')} />
              </View>
            }
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, minHeight: 320 },
  centerText: { color: colors.textMuted, textAlign: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  summary: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md },
  stat: { alignItems: 'center', flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, minWidth: 48, alignItems: 'center' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  onlineBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.info,
  },
});
