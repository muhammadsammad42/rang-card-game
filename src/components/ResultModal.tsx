/**
 * ResultModal.tsx — the end-of-hand screen: a big LottieFiles trophy + confetti
 * celebration (or a sad animation on a loss), trick totals that count up, the hand summary (bidder, bid,
 * Rang, reveal, tricks per team), the match score, the cloud-save status, and
 * Next Hand / Restart Match / Home.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ReactNode, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { SUIT_NAMES } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import { teamOf } from '@/game/rules';
import type { GameState, Seat } from '@/game/types';
import { useMotion } from '@/hooks/useMotion';
import { colors, radii, spacing, typography } from '@/theme/theme';
import { teamLabel } from '@/utils/format';

import { AppButton } from './AppButton';
import { FadeInView } from './FadeInView';
import { LottieAnim } from './LottieAnim';
import { Overlay } from './Overlay';
import { SuitIcon, suitColorOnDark } from './SuitIcon';

interface Props {
  game: GameState;
  players: PlayerProfile[];
  humanSeat: Seat;
  saveStatus: 'idle' | 'saving' | 'saved' | 'queued' | 'offline';
  onNextHand: () => void;
  onRestartMatch: () => void;
  onHome: () => void;
  /** Online: only the host may deal the next hand; others see a waiting message. Default true. */
  canContinue?: boolean;
  /** Label for the Home button (online: "Leave Room"). */
  homeLabel?: string;
}

/** Counts up from 0 to `value` (≈60 ms per step); shows the value at once with reduced motion. */
function CountUp({ value, delay = 0 }: { value: number; delay?: number }) {
  const { reduced } = useMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (reduced) return;
    let n = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        n += 1;
        setShown(Math.min(n, value));
        if (n >= value && timer) clearInterval(timer);
      }, 60);
    }, delay);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
  }, [value, delay, reduced]);
  return <Text style={[typography.display, { color: colors.ivory, fontSize: 40 }]}>{reduced ? value : shown}</Text>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={[typography.label, styles.rowLabel]}>{label}</Text>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

export function ResultModal({
  game,
  players,
  humanSeat,
  saveStatus,
  onNextHand,
  onRestartMatch,
  onHome,
  canContinue = true,
  homeLabel = 'Home',
}: Props) {
  const { height } = useWindowDimensions();
  const r = game.result;
  if (!r) return null;
  const myTeam = teamOf(humanSeat);
  const won = r.winnerTeam === myTeam;
  const weBid = r.biddingTeam === myTeam;
  const headline = won ? 'Victory!' : 'Hand lost';
  const sub = weBid
    ? won
      ? `Your team made its bid of ${r.bid}.`
      : `Your team fell short of ${r.bid}.`
    : won
      ? `You stopped the opponents' bid of ${r.bid}.`
      : `The opponents made their bid of ${r.bid}.`;
  const valueText = [typography.body, { color: colors.ivory }];

  return (
    <Overlay maxWidth={460}>
      {won && (
        <View pointerEvents="none" style={styles.confetti}>
          <LottieAnim name="confetti" loop={false} style={{ width: '100%', height: '100%' }} />
        </View>
      )}
      <ScrollView style={{ maxHeight: height * 0.66 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {won ? (
            <LottieAnim name="trophy" loop={false} style={styles.heroAnim} />
          ) : (
            <View style={styles.loseMedal}>
              <LottieAnim name="lose" style={styles.loseAnim} />
            </View>
          )}
          <FadeInView from="up" delay={150} distance={14}>
            <Text
              accessibilityRole="header"
              style={[typography.display, styles.headline, { color: won ? colors.goldLight : colors.ivory }]}>
              {headline}
            </Text>
            <Text style={[typography.body, styles.sub]}>{sub}</Text>
          </FadeInView>
        </View>

        <View style={styles.summary}>
          <Row label="Bidder">
            <MaterialCommunityIcons name="crown" size={16} color={colors.goldLight} />
            <Text style={valueText}>
              {players[r.bidder].name} · {teamLabel(r.biddingTeam)}
            </Text>
          </Row>
          <Row label="Bid">
            <Text style={valueText}>
              {r.bid} tricks{r.forcedBid ? ' (all passed)' : ''}
            </Text>
          </Row>
          <Row label="Rang">
            <SuitIcon suit={r.rangSuit} size={16} color={suitColorOnDark(r.rangSuit)} />
            <Text style={valueText}>{SUIT_NAMES[r.rangSuit]}</Text>
          </Row>
          <Row label="Revealed">
            <Text style={valueText}>
              {r.revealedAtTrick === null
                ? 'Never'
                : `Trick ${r.revealedAtTrick} by ${r.revealedBy !== null ? players[r.revealedBy].name : '—'}${game.autoRevealed ? ' (auto)' : ''}`}
            </Text>
          </Row>
          <View style={styles.tricks}>
            {(['A', 'B'] as const).map((team) => (
              <View
                key={team}
                accessible
                accessibilityLabel={`${teamLabel(team)}: ${r.tricksWon[team]} tricks, needed ${team === r.biddingTeam ? r.bid : 14 - r.bid}`}
                style={[
                  styles.trickBox,
                  { borderColor: team === 'A' ? colors.teamA : colors.teamB },
                  team === r.winnerTeam && { backgroundColor: team === 'A' ? colors.teamASoft : colors.teamBSoft },
                ]}>
                <Text style={[typography.micro, { color: team === 'A' ? colors.teamA : colors.teamB }]}>{teamLabel(team)}</Text>
                <CountUp value={r.tricksWon[team]} delay={team === 'A' ? 350 : 500} />
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {team === r.biddingTeam ? `needed ${r.bid}` : `needed ${14 - r.bid}`}
                </Text>
              </View>
            ))}
          </View>
          {r.leftover && (
            <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
              {r.leftover.count} leftover trick{r.leftover.count === 1 ? '' : 's'} from the middle pile went to{' '}
              {teamLabel(r.leftover.team).toLowerCase()}.
            </Text>
          )}
        </View>

        <View style={styles.score}>
          <Text style={[typography.label, { color: colors.textMuted }]}>Match score</Text>
          <Text style={[typography.heading, { color: colors.ivory }]}>
            <Text style={{ color: colors.teamA }}>Us {game.score.A}</Text>
            {'  –  '}
            <Text style={{ color: colors.teamB }}>{game.score.B} Them</Text>
          </Text>
        </View>

        <SaveLine status={saveStatus} />
      </ScrollView>

      {/* Buttons sit below the scrolling summary so they are always visible, even on small phones. */}
      {canContinue ? (
        <View style={styles.buttons}>
          <AppButton label="Next Hand" icon="cards-playing-outline" onPress={onNextHand} />
          <View style={styles.buttonRow}>
            <AppButton label="Restart Match" variant="secondary" size="sm" onPress={onRestartMatch} style={styles.flex} />
            <AppButton label={homeLabel} variant="secondary" size="sm" icon="home-outline" onPress={onHome} style={styles.flex} />
          </View>
        </View>
      ) : (
        <View style={styles.buttons}>
          <View style={styles.waiting}>
            <LottieAnim name="loading" style={{ width: 34, height: 34 }} />
            <Text style={[typography.label, { color: colors.textMuted }]}>Waiting for the host to deal the next hand…</Text>
          </View>
          <AppButton label={homeLabel} variant="secondary" size="sm" icon="exit-run" onPress={onHome} />
        </View>
      )}
    </Overlay>
  );
}

/** Small status line for the Firebase save (with the LottieFiles cloud animation while saving). */
function SaveLine({ status }: { status: Props['saveStatus'] }) {
  if (status === 'idle') return null;
  const text =
    status === 'saving'
      ? 'Saving to cloud history…'
      : status === 'saved'
        ? 'Saved to cloud history'
        : status === 'queued'
          ? 'Offline — will sync later'
          : 'Cloud history not configured';
  return (
    <View style={styles.saveLine} accessibilityLiveRegion="polite">
      {status === 'saving' ? (
        <LottieAnim name="cloudUpload" style={{ width: 28, height: 22 }} />
      ) : (
        <MaterialCommunityIcons
          name={status === 'saved' ? 'cloud-check-outline' : 'cloud-off-outline'}
          size={18}
          color={status === 'saved' ? colors.success : colors.textDim}
        />
      )}
      <Text style={[typography.caption, { color: colors.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  confetti: { ...StyleSheet.absoluteFill, zIndex: 2 },
  content: { gap: spacing.md },
  hero: { alignItems: 'center' },
  heroAnim: { width: 180, height: 180 },
  loseMedal: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.ivory,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  loseAnim: { width: 130, height: 130 },
  headline: { fontSize: 34, textAlign: 'center' },
  sub: { color: colors.textMuted, textAlign: 'center' },
  summary: { backgroundColor: colors.nightPanel, borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: colors.textMuted },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  tricks: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  trickBox: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: radii.md, paddingVertical: spacing.sm },
  score: { alignItems: 'center', gap: 2 },
  saveLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttons: { gap: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
