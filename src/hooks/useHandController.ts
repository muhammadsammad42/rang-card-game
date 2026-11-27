/**
 * useHandController.ts — everything the Game screens need to drive <Hand>,
 * shared by offline (GameProvider) and online (OnlineRoomProvider) play.
 *
 *  - sorts the hand (by suit or by rank, from Settings) and attaches the
 *    engine's legality to each card (`buildHandView` → isPlayable + state);
 *  - keeps the selected card (tap once = select, tap again = play);
 *  - turns a tap on an illegal card into a clear hint ("You must follow ♦
 *    Diamonds") + error haptic, without sending anything to the engine;
 *  - exposes STABLE callbacks (they read the latest values from refs), so the
 *    memoised cards in <Hand> don't all re-render when the selection changes.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';

import type { Card, GameState } from '@/game/types';
import { useSettings } from '@/context/SettingsProvider';
import { buildHandView, illegalMessage, sortForDisplay } from '@/utils/handView';

import { useFeedback } from './useFeedback';
import { useSound } from './useSound';

interface Options {
  game: GameState | null;
  /** The viewer's seat in `game` (offline: 0; online: always 0 in the local view). */
  seat: number;
  legalIds: ReadonlySet<string>;
  /** True only when it is the viewer's turn in the PLAYING phase and input isn't locked. */
  canPlay: boolean;
  /** Sends the play to the engine/host. Returns false if it was refused. Plays its own "play" haptic. */
  play: (card: Card) => boolean;
}

export function useHandController({ game, seat, legalIds, canPlay, play }: Options) {
  const { settings, update } = useSettings();
  const feedback = useFeedback();
  const sfx = useSound();
  const sortMode = settings.handSort;

  const sorted = useMemo(() => (game ? sortForDisplay(game.hands[seat], sortMode) : []), [game, seat, sortMode]);
  const cards = useMemo(() => buildHandView(sorted, legalIds, canPlay), [sorted, legalIds, canPlay]);

  /** Selection, remembered with the state it was made in (a new state clears it automatically if the card is gone). */
  const [selected, setSelected] = useState<string | null>(null);
  const selectedId = canPlay && selected && cards.some((c) => c.card.id === selected && c.isPlayable) ? selected : null;

  /** Illegal-tap hint; belongs to the game state it describes, so it vanishes once the game moves on. */
  const [hint, setHint] = useState<{ message: string; seq: number; game: GameState | null } | null>(null);
  const hintSeq = useRef(0);
  const activeHint = hint && hint.game === game ? { message: hint.message, seq: hint.seq } : null;

  /** Shared with the drop zone on the table (0 idle · 1 dragging · 2 over the zone). */
  const dragState = useSharedValue(0);

  // Latest values for the stable callbacks below.
  const latest = useRef({ game, canPlay, selectedId, play, feedback });
  useLayoutEffect(() => {
    latest.current = { game, canPlay, selectedId, play, feedback };
  });

  const onPlay = useCallback((card: Card) => {
    const { canPlay: ok, play: send } = latest.current;
    if (!ok) return false;
    const done = send(card);
    if (done) {
      setSelected(null);
      sfx('play');
    }
    return done;
  }, [sfx]);

  const onTap = useCallback(
    (card: Card) => {
      const { canPlay: ok, selectedId: sel, feedback: fb } = latest.current;
      if (!ok) return;
      if (sel === card.id) {
        onPlay(card);
      } else {
        setSelected(card.id);
        fb.tap();
        sfx('select');
      }
    },
    [onPlay, sfx],
  );

  const onBlocked = useCallback(() => {
    const { game: g, feedback: fb } = latest.current;
    if (!g) return;
    hintSeq.current += 1;
    setHint({ message: illegalMessage(g.currentTrick), seq: hintSeq.current, game: g });
    fb.error();
    sfx('invalid');
  }, [sfx]);

  const toggleSort = useCallback(() => {
    update({ handSort: sortMode === 'suit' ? 'rank' : 'suit' });
    feedback.tap();
  }, [update, sortMode, feedback]);

  return { cards, selectedId, onTap, onPlay, onBlocked, hint: activeHint, dragState, sortMode, toggleSort };
}
