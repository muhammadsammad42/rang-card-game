/**
 * PauseMenu.tsx — Resume / Restart Hand / Restart Match / Quit to Home.
 * Every destructive choice asks for confirmation first. Bots and timers are
 * stopped while this menu is open (GameProvider checks `paused`).
 */
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, typography } from '@/theme/theme';

import { AppButton } from './AppButton';
import { ConfirmDialog } from './ConfirmDialog';
import { Overlay } from './Overlay';

interface Props {
  handNumber: number;
  onResume: () => void;
  onRestartHand: () => void;
  onRestartMatch: () => void;
  onQuit: () => void;
}

type Pending = 'hand' | 'match' | 'quit' | null;

const CONFIRM: Record<Exclude<Pending, null>, { title: string; message: string; label: string }> = {
  hand: { title: 'Restart this hand?', message: 'The cards will be reshuffled and dealt again. The match score is kept.', label: 'Restart hand' },
  match: { title: 'Restart the match?', message: 'The score goes back to 0–0 and a new first hand is dealt.', label: 'Restart match' },
  quit: { title: 'Quit to Home?', message: 'The current match will end. Finished hands are already saved in your history.', label: 'Quit' },
};

export function PauseMenu({ handNumber, onResume, onRestartHand, onRestartMatch, onQuit }: Props) {
  const [pending, setPending] = useState<Pending>(null);

  if (pending) {
    const c = CONFIRM[pending];
    const run = pending === 'hand' ? onRestartHand : pending === 'match' ? onRestartMatch : onQuit;
    return (
      <ConfirmDialog
        title={c.title}
        message={c.message}
        confirmLabel={c.label}
        danger={pending !== 'hand'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          setPending(null);
          run();
        }}
      />
    );
  }

  return (
    <Overlay maxWidth={360}>
      <Text style={[typography.micro, styles.kicker]}>Hand {handNumber}</Text>
      <Text style={[typography.title, styles.title]}>Paused</Text>
      <AppButton label="Resume" icon="play" onPress={onResume} />
      <AppButton label="Restart Hand" icon="refresh" variant="secondary" onPress={() => setPending('hand')} />
      <AppButton label="Restart Match" icon="restart" variant="secondary" onPress={() => setPending('match')} />
      <AppButton label="Quit to Home" icon="home-outline" variant="ghost" onPress={() => setPending('quit')} />
    </Overlay>
  );
}

const styles = StyleSheet.create({
  kicker: { color: colors.gold, textAlign: 'center' },
  title: { color: colors.ivory, textAlign: 'center', marginBottom: 4 },
});
