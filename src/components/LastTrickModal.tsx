/**
 * LastTrickModal.tsx — a bottom sheet that slides up to "peek" at the most
 * recent finished trick: who played which card (the leader is marked ▶),
 * who won it (gold glow), and where it went (team or middle pile).
 */
import { StyleSheet, Text, View } from 'react-native';

import { cardName } from '@/game/deck';
import type { PlayerProfile } from '@/game/players';
import type { TrickRecord } from '@/game/types';
import { colors, radii, spacing, typography } from '@/theme/theme';
import { teamLabel } from '@/utils/format';

import { AppButton } from './AppButton';
import { Overlay } from './Overlay';
import { PlayingCard } from './PlayingCard';

/** Plain-English description of where a trick went. */
export function describeOutcome(t: TrickRecord, players: PlayerProfile[]): string {
  switch (t.outcome.type) {
    case 'team':
      return `Went to ${teamLabel(t.outcome.team).toLowerCase()}`;
    case 'pile':
      return `Placed in the middle pile (${t.outcome.pileSize} waiting)`;
    case 'collected':
      return t.outcome.leftover
        ? `Leftover pile of ${t.outcome.count} went to ${teamLabel(t.outcome.team).toLowerCase()}`
        : `${players[t.winner].name} won twice in a row and collected ${t.outcome.count}`;
  }
}

export function LastTrickModal({ trick, players, onClose }: { trick: TrickRecord; players: PlayerProfile[]; onClose: () => void }) {
  return (
    <Overlay position="bottom" maxWidth={480}>
      <Text style={[typography.micro, { color: colors.gold }]}>Trick {trick.number}</Text>
      <Text style={[typography.title, { color: colors.ivory, fontSize: 22 }]}>{players[trick.winner].name} won</Text>
      <View style={styles.row}>
        {trick.plays.map((p, i) => (
          <View key={p.card.id} style={styles.play} accessible accessibilityLabel={`${players[p.seat].name}${i === 0 ? ' led' : ' played'} ${cardName(p.card)}${p.seat === trick.winner ? ', winner' : ''}`}>
            <PlayingCard card={p.card} width={58} highlighted={p.seat === trick.winner} />
            <Text numberOfLines={1} style={[typography.caption, styles.name, p.seat === trick.winner && { color: colors.goldLight }]}>
              {i === 0 ? '▶ ' : ''}
              {players[p.seat].name}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.note}>
        <Text style={[typography.label, { color: colors.ivory }]}>{describeOutcome(trick, players)}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {trick.trumpActive ? 'Judged with the Rang (trump) revealed' : 'Rang hidden — highest card of the led suit won'}
        </Text>
      </View>
      <AppButton label="Close" variant="secondary" onPress={onClose} />
    </Overlay>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  play: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  name: { color: colors.textMuted, maxWidth: 80 },
  note: { backgroundColor: colors.nightPanel, borderRadius: radii.md, padding: spacing.md, gap: 2 },
});
