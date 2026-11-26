/**
 * GameProvider.tsx — connects the pure game engine to React.
 *
 *  - Holds the GameState in `useReducer` (the reducer is the engine itself).
 *  - Validates human actions first, so illegal moves show a message + haptic
 *    instead of changing anything.
 *  - Runs the bots: whenever it is a bot's turn, a timer waits a natural
 *    "thinking" delay, asks ai.ts for a move using only that bot's PublicView,
 *    and dispatches it. Timers are cleared whenever the state changes, the game
 *    is paused, the app goes to the background or the Game screen loses focus,
 *    so stale moves can never fire.
 *  - Keeps each finished trick on the table briefly (hold → sweep) before the
 *    next move, and exposes "events" (Rang revealed, pile collected) for animations.
 *  - When a hand ends, records local stats and hands the result to the history
 *    service (Firebase).
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { decideBotAction } from '@/game/ai';
import { randomSeed, SUIT_NAMES } from '@/game/deck';
import { applyAction, createMatch, gameReducer, getLegalCards, getPublicView } from '@/game/engine';
import { getPlayers, HUMAN_SEAT, PlayerProfile } from '@/game/players';
import { legalCards, revealError, teamOf } from '@/game/rules';
import { FIRST_DEAL_SIZE, SECOND_DEAL_SIZE } from '@/game/rulesConfig';
import type { GameAction, GameState, Seat, TrickRecord } from '@/game/types';
import { useFeedback } from '@/hooks/useFeedback';
import { saveHandResult } from '@/services/historyService';
import { motion } from '@/theme/theme';
import { useToast } from '@/components/Toast';

import { BOT_DELAY, useSettings } from './SettingsProvider';

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** How long the deal animation runs before FINISH_DEAL is dispatched. */
export function dealDuration(phase: 'DEAL_5' | 'DEAL_REST'): number {
  const cards = 4 * (phase === 'DEAL_5' ? FIRST_DEAL_SIZE : SECOND_DEAL_SIZE);
  const stagger = phase === 'DEAL_5' ? motion.deal : motion.deal * 0.55;
  return Math.round(cards * stagger + 650);
}
export const TRICK_HOLD_MS = motion.trickHold;
export const TRICK_SWEEP_MS = 420;

// ---------------------------------------------------------------------------
// Reducer: the engine plus "start" and "quit"
// ---------------------------------------------------------------------------

type ProviderAction = GameAction | { type: 'QUIT' };

/** The store is `null` until a match starts; otherwise the engine handles every action. */
function rootReducer(state: GameState | null, action: ProviderAction): GameState | null {
  if (action.type === 'QUIT') return null;
  if (action.type === 'NEW_MATCH') return createMatch(action.seed);
  return state ? gameReducer(state, action) : state;
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface ShownTrick {
  record: TrickRecord;
  stage: 'hold' | 'sweep';
}

export interface GameEvents {
  /** Increments each time the Rang is revealed (drives the flip + burst). */
  revealSeq: number;
  /** Increments each time a middle pile is collected (drives the sparkle). */
  collectSeq: number;
}

interface GameContextValue {
  game: GameState | null;
  players: PlayerProfile[];
  humanSeat: Seat;
  /** Ids of the human's cards that are legal right now. */
  legalIds: Set<string>;
  canReveal: boolean;
  isHumanTurn: boolean;
  /** True while the human must wait (bot turn, trick on display, paused…). */
  inputLocked: boolean;
  shownTrick: ShownTrick | null;
  resultVisible: boolean;
  paused: boolean;
  error: { message: string; seq: number } | null;
  events: GameEvents;
  saveStatus: 'idle' | 'saving' | 'saved' | 'queued' | 'offline';
  startNewMatch: () => void;
  playCard: (cardId: string) => boolean;
  bid: (value: number) => void;
  pass: () => void;
  chooseRang: (cardId: string) => void;
  reveal: () => void;
  nextHand: () => void;
  restartHand: () => void;
  restartMatch: () => void;
  quitMatch: () => void;
  pause: () => void;
  resume: () => void;
  /** The Game screen marks itself active while focused (bots only run then). */
  setActive: (active: boolean) => void;
}

const GameContext = createContext<GameContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, dispatch] = useReducer(rootReducer, null);
  const { settings, recordHand } = useSettings();
  const feedback = useFeedback();
  const toast = useToast();

  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(false);
  const [events, setEvents] = useState<GameEvents>({ revealSeq: 0, collectSeq: 0 });

  /** Identifies the current hand. Per-hand UI state is stored with this key, so a new hand resets it automatically. */
  const handKey = game ? `${game.handNumber}:${game.handSeed}` : '';
  const trickCount = game?.completedTricks.length ?? 0;

  /** How many finished tricks of this hand have been shown and swept off the table. */
  const [acked, setAcked] = useState({ key: '', count: 0 });
  const ackedTricks = acked.key === handKey ? acked.count : 0;
  /** The finished trick currently sweeping away (hand key + trick number). */
  const [sweepAt, setSweepAt] = useState<{ key: string; trick: number } | null>(null);
  const sweeping = sweepAt !== null && sweepAt.key === handKey && sweepAt.trick === trickCount;
  /** Cloud-save status of this hand's result. */
  const [save, setSave] = useState<{ key: string; status: GameContextValue['saveStatus'] }>({ key: '', status: 'idle' });
  const saveStatus = save.key === handKey ? save.status : 'idle';
  /** An illegal-move message. It belongs to the state it describes, so it disappears as soon as the game moves on. */
  const [errorState, setErrorState] = useState<{ message: string; seq: number; game: GameState } | null>(null);
  const error = useMemo(
    () => (errorState && errorState.game === game ? { message: errorState.message, seq: errorState.seq } : null),
    [errorState, game],
  );

  /**
   * The finished trick still lying on the table (derived during render so the
   * cards never flicker): any completed trick not yet acknowledged is shown,
   * first in 'hold' (everyone sees who won), then 'sweep' (cards fly away).
   */
  const lastTrick = game && trickCount > ackedTricks ? game.completedTricks[trickCount - 1] : null;
  const shownTrick = useMemo<ShownTrick | null>(
    () => (lastTrick ? { record: lastTrick, stage: sweeping ? 'sweep' : 'hold' } : null),
    [lastTrick, sweeping],
  );

  const players = useMemo(() => getPlayers(settings.playerName), [settings.playerName]);

  // Refs give timers and callbacks the latest values without re-subscribing.
  // They are updated in a layout effect (after render, before any timer or tap can fire).
  const gameRef = useRef(game);
  const pausedRef = useRef(paused);
  const shownRef = useRef(shownTrick);
  const playersRef = useRef(players);
  useLayoutEffect(() => {
    gameRef.current = game;
    pausedRef.current = paused;
    shownRef.current = shownTrick;
    playersRef.current = players;
  });

  /** Blocks double taps between dispatching a human move and the re-render. */
  const inputLockRef = useRef(false);
  const errorSeq = useRef(0);
  const handStartedAt = useRef(0);
  /** Trick count seen by the announcement effect (to detect newly finished tricks). */
  const prevTrickCount = useRef(0);

  // Release the double-tap lock once the new state has rendered.
  useEffect(() => {
    inputLockRef.current = false;
  }, [game]);

  // ---- Pause automatically when the app goes to the background ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const g = gameRef.current;
      if (next !== 'active' && g && g.phase !== 'HAND_OVER') setPaused(true);
    });
    return () => sub.remove();
  }, []);

  // ---- A new hand started: restart the clock (per-hand state resets via handKey) ----
  useEffect(() => {
    if (!handKey) return;
    handStartedAt.current = Date.now();
    prevTrickCount.current = 0;
  }, [handKey]);

  // ---- A trick finished: hold it on the table, then sweep it away ----
  useEffect(() => {
    if (trickCount <= ackedTricks) return;
    const key = handKey;
    const trick = trickCount;
    const toSweep = setTimeout(() => setSweepAt({ key, trick }), TRICK_HOLD_MS);
    const done = setTimeout(() => setAcked({ key, count: trick }), TRICK_HOLD_MS + TRICK_SWEEP_MS);
    return () => {
      clearTimeout(toSweep);
      clearTimeout(done);
    };
  }, [trickCount, ackedTricks, handKey]);

  // ---- Announce pile collections (sparkle + toast) ----
  useEffect(() => {
    const g = gameRef.current;
    const prev = prevTrickCount.current;
    prevTrickCount.current = trickCount;
    if (!g || trickCount <= prev) return;
    const record = g.completedTricks[trickCount - 1];
    if (record.outcome.type === 'collected') {
      const { team, count, leftover } = record.outcome;
      setEvents((e) => ({ ...e, collectSeq: e.collectSeq + 1 }));
      feedback.success();
      const who = leftover ? (team === 'A' ? 'Your team' : 'The opponents') : playersRef.current[record.winner].name;
      toast.show(
        leftover
          ? `${who} took the ${count} leftover trick${count === 1 ? '' : 's'} from the pile`
          : `${who} collected ${count} trick${count === 1 ? '' : 's'} from the pile!`,
        team === 'A' ? 'success' : 'warning',
      );
    }
  }, [trickCount, feedback, toast]);

  // ---- The Rang was revealed ----
  const revealed = game?.rangRevealed ?? false;
  useEffect(() => {
    const g = gameRef.current;
    if (!revealed || !g || g.revealedBy === null || !g.rangSuit) return;
    setEvents((e) => ({ ...e, revealSeq: e.revealSeq + 1 }));
    feedback.warning();
    const who = playersRef.current[g.revealedBy].name;
    toast.show(
      g.autoRevealed ? `Rang revealed automatically: ${SUIT_NAMES[g.rangSuit]}` : `${who} revealed the Rang: ${SUIT_NAMES[g.rangSuit]}`,
      'warning',
    );
  }, [revealed, feedback, toast]);

  // ---- The hand ended: stats + history (once per hand) ----
  const recordedHand = useRef('');
  useEffect(() => {
    const g = gameRef.current;
    if (!g || g.phase !== 'HAND_OVER' || !g.result || recordedHand.current === handKey) return;
    recordedHand.current = handKey;
    const humanWon = g.result.winnerTeam === teamOf(HUMAN_SEAT);
    recordHand({ won: humanWon, wasBidder: g.result.bidder === HUMAN_SEAT, bid: g.result.bid });
    const durationSeconds = Math.round((Date.now() - handStartedAt.current) / 1000);
    const key = handKey;
    setSave({ key, status: 'saving' });
    saveHandResult(g, playersRef.current, durationSeconds)
      .then((status) => {
        setSave({ key, status });
        if (status === 'queued') toast.show('Offline — this game will sync to the cloud later', 'info');
      })
      .catch(() => setSave({ key, status: 'queued' }));
  }, [game?.phase, handKey, recordHand, toast]);

  // ---- The scheduler: deals and bot moves ----
  const shownActive = shownTrick !== null;
  useEffect(() => {
    if (!game || paused || !active) return;
    let delay: number;
    let task: () => void;
    if (game.phase === 'DEAL_5' || game.phase === 'DEAL_REST') {
      delay = dealDuration(game.phase);
      task = () => dispatch({ type: 'FINISH_DEAL' });
    } else if (game.phase === 'HAND_OVER' || shownActive || game.turn === HUMAN_SEAT) {
      return; // waiting for the human, or for the finished trick to clear
    } else {
      const [min, max] = BOT_DELAY[settings.botSpeed];
      delay = min + Math.random() * (max - min);
      task = () => {
        const g = gameRef.current;
        if (!g || g.turn === HUMAN_SEAT) return;
        const action = decideBotAction(getPublicView(g, g.turn), settings.difficulty) ?? fallbackAction(g);
        // Defensive: if a bot ever proposes an illegal move, play a safe legal one instead of stalling.
        dispatch(applyAction(g, action).ok ? action : fallbackAction(g));
      };
    }
    const timer = setTimeout(task, delay);
    return () => clearTimeout(timer);
  }, [game, paused, active, shownActive, settings.botSpeed, settings.difficulty]);

  // ---- Human actions ----

  /** Validates and dispatches a human action; returns false (with feedback) if illegal. */
  const act = useCallback(
    (action: GameAction): boolean => {
      const g = gameRef.current;
      if (!g || pausedRef.current || inputLockRef.current) return false;
      if (shownRef.current && (action.type === 'PLAY_CARD' || action.type === 'REVEAL_RANG')) return false;
      const res = applyAction(g, action);
      if (!res.ok) {
        errorSeq.current += 1;
        setErrorState({ message: res.error, seq: errorSeq.current, game: g });
        feedback.error();
        return false;
      }
      inputLockRef.current = true;
      setErrorState(null);
      dispatch(action);
      return true;
    },
    [feedback],
  );

  const playCard = useCallback(
    (cardId: string) => {
      const ok = act({ type: 'PLAY_CARD', seat: HUMAN_SEAT, cardId });
      if (ok) feedback.play();
      return ok;
    },
    [act, feedback],
  );
  const bid = useCallback((value: number) => void act({ type: 'BID', seat: HUMAN_SEAT, value }), [act]);
  const pass = useCallback(() => void act({ type: 'PASS', seat: HUMAN_SEAT }), [act]);
  const chooseRang = useCallback((cardId: string) => void act({ type: 'CHOOSE_RANG', seat: HUMAN_SEAT, cardId }), [act]);
  const reveal = useCallback(() => void act({ type: 'REVEAL_RANG', seat: HUMAN_SEAT }), [act]);

  /** Clears transient UI state before a new deal (per-hand state resets via the new hand key). */
  const resetTransient = useCallback(() => {
    setErrorState(null);
    setPaused(false);
    inputLockRef.current = false;
  }, []);

  const startNewMatch = useCallback(() => {
    resetTransient();
    dispatch({ type: 'NEW_MATCH', seed: randomSeed() });
  }, [resetTransient]);
  const nextHand = useCallback(() => {
    resetTransient();
    dispatch({ type: 'NEXT_HAND', seed: randomSeed() });
  }, [resetTransient]);
  const restartHand = useCallback(() => {
    resetTransient();
    dispatch({ type: 'RESTART_HAND', seed: randomSeed() });
  }, [resetTransient]);
  const restartMatch = useCallback(() => {
    resetTransient();
    dispatch({ type: 'RESTART_MATCH', seed: randomSeed() });
  }, [resetTransient]);
  const quitMatch = useCallback(() => {
    resetTransient();
    dispatch({ type: 'QUIT' });
  }, [resetTransient]);
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  // ---- Derived values for the UI ----
  const legalIds = useMemo(
    () => new Set(game ? getLegalCards(game, HUMAN_SEAT).map((c) => c.id) : []),
    [game],
  );
  const canReveal = !!game && revealError(game, HUMAN_SEAT) === null && !shownActive;
  const isHumanTurn = !!game && game.turn === HUMAN_SEAT && game.phase !== 'HAND_OVER';
  const inputLocked = !game || paused || shownActive || !isHumanTurn;
  const resultVisible = !!game && game.phase === 'HAND_OVER' && !shownActive;

  const value = useMemo<GameContextValue>(
    () => ({
      game,
      players,
      humanSeat: HUMAN_SEAT,
      legalIds,
      canReveal,
      isHumanTurn,
      inputLocked,
      shownTrick,
      resultVisible,
      paused,
      error,
      events,
      saveStatus,
      startNewMatch,
      playCard,
      bid,
      pass,
      chooseRang,
      reveal,
      nextHand,
      restartHand,
      restartMatch,
      quitMatch,
      pause,
      resume,
      setActive,
    }),
    [
      game, players, legalIds, canReveal, isHumanTurn, inputLocked, shownTrick, resultVisible, paused, error,
      events, saveStatus, startNewMatch, playCard, bid, pass, chooseRang, reveal, nextHand, restartHand,
      restartMatch, quitMatch, pause, resume,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

/** A guaranteed-legal move for the seat to act (used only as a safety net). */
function fallbackAction(g: GameState): GameAction {
  const seat = g.turn;
  if (g.phase === 'BIDDING') return { type: 'PASS', seat };
  if (g.phase === 'CHOOSE_RANG') return { type: 'CHOOSE_RANG', seat, cardId: g.hands[seat][0].id };
  const legal = legalCards(g.hands[seat], g.currentTrick);
  return legal.length > 0 ? { type: 'PLAY_CARD', seat, cardId: legal[0].id } : { type: 'REVEAL_RANG', seat };
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>');
  return ctx;
}
