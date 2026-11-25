/**
 * RangPicker.tsx — shown when the human wins the bid. Pick one of your 5
 * cards to place face down: its suit becomes the hidden Rang (trump). Nobody
 * else learns it until it is revealed — not even your partner.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cardName, sortHand, SUIT_NAMES } from '@/game/deck';
import type { Card } from '@/game/types';
import { colors, spacing, typography } from '@/theme/theme';

import { AppButton } from './AppButton';
import { Overlay } from './Overlay';
import { PlayingCard } from './PlayingCard';

interface Props {
  cards: Card[];
  bid: number;
  forced: boolean;
  cardWidth: number;
  onConfirm: (cardId: string) => void;
}

export function RangPicker({ cards, bid, forced, cardWidth, onConfirm }: Props) {
  const [selected, setSelected] = useState<Card | null>(null);
  const sorted = sortHand(cards);
  return (
    <Overlay maxWidth={520}>
      <Text style={[typography.micro, { color: colors.gold }]}>{forced ? 'Everyone passed — you must bid 8' : `You won the bid: ${bid}`}</Text>
      <Text style={[typography.title, { color: colors.ivory }]}>Choose your Rang</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>
        Place one card face down. Its suit becomes the hidden trump. Nobody else will know it until it is revealed.
      </Text>
      <View style={styles.cards}>
        {sorted.map((c) => {
          const isSel = selected?.id === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setSelected(c)}
              accessibilityRole="button"
              accessibilityLabel={`${cardName(c)}: make ${SUIT_NAMES[c.suit]} the Rang`}
              accessibilityState={{ selected: isSel }}
              style={{ transform: [{ translateY: isSel ? -12 : 0 }] }}>
              <PlayingCard card={c} width={cardWidth} highlighted={isSel} dimmed={!!selected && !isSel} />
            </Pressable>
          );
        })}
      </View>
      <AppButton
        label={selected ? `Place face down · Rang ${SUIT_NAMES[selected.suit]}` : 'Tap a card'}
        icon="lock-outline"
        disabled={!selected}
        onPress={() => selected && onConfirm(selected.id)}
      />
    </Overlay>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingTop: spacing.md },
});
