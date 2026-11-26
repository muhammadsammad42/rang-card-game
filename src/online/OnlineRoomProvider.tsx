/**
 * OnlineRoomProvider.tsx — everything an online room needs, shared by the
 * online screens (menu → lobby → table) through React Context.
 *
 * Every device:
 *   - signs in anonymously, creates/joins a room, sends heartbeats (~10 s);
 *   - listens to the room, its players, its own hand and its own action
 *     requests (a reducer merges them so the table only shows a public state
 *     and a hand from the SAME version);
 *   - builds the local view (protocol.toLocalView) that the existing table
 *     components render — you are always South;
 *   - validates its own moves locally (instant feedback) and sends them as
 *     action requests.
 * The HOST additionally runs the HostController: it processes pending
 * actions, seat requests, deals, bots and disconnects, and publishes state.
 *
 * Leaving the room (or the online section) unsubscribes every listener and
 * stops every timer.
 */
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import { useToast } from '@/components/Toast';
import { useSettings, BOT_DELAY } from '@/context/SettingsProvider';
import { dealDuration, TRICK_HOLD_MS, TRICK_SWEEP_MS } from '@/context/GameProvider';
import { applyAction, getLegalCards } from '@/game/engine';
import { revealError } from '@/game/rules';
import type { Seat } from '@/game/types';
import { useFeedback } from '@/hooks/useFeedback';
import { useIsOnline } from '@/hooks/useIsOnline';
import { authErrorMessage, ensureSignedIn } from '@/services/auth';
import { isFirebaseConfigured } from '@/services/firebase';

import { HostController } from './HostController';
import { handDocFor, LocalView, seatOf, staleSeats, toLocalView, toPublicState } from './protocol';
import * as svc from './roomService';
import type { ActionType, HandDoc, PlayerDoc, PublicState, RoomDoc } from './types';

/** Heartbeat interval, and how long without one before a player counts as gone. */
export const HEARTBEAT_MS = 10_000;
export const DISCONNECT_MS = 30_000;
const HOST_GONE_MS = 40_000;
const NO_SEATS: RoomDoc['seats'] = [];

// ---------------------------------------------------------------------------
// Network snapshot reducer
// ---------------------------------------------------------------------------

interface NetState {
  room: RoomDoc | null;
  fromCache: boolean;
  hand: HandDoc | null;
  players: PlayerDoc[];
  /** The public state + hand pair currently on screen (always the same version). */
  shown: { pub: PublicState | null; hand: HandDoc | null };
}

type NetMsg =
  | { type: 'room'; room: RoomDoc | null; fromCache: boolean; uid: string }
  | { type: 'hand'; hand: HandDoc | null }
  | { type: 'players'; players: PlayerDoc[] }
  | { type: 'reset' };

const EMPTY_NET: NetState = { room: null, fromCache: false, hand: null, players: [], shown: { pub: null, hand: null } };

/** Public state and private hand arrive separately; only show them together when their versions match. */
function netReducer(s: NetState, m: NetMsg): NetState {
  switch (m.type) {
    case 'reset':
      return EMPTY_NET;
    case 'players':
      return { ...s, players: m.players };
    case 'room': {
      const pub = m.room?.publicState ?? null;
      const seated = !!m.room && seatOf(m.room.seats, m.uid) !== null;
      const consistent = !pub || !seated || (s.hand !== null && s.hand.version === pub.version);
      return { ...s, room: m.room, fromCache: m.fromCache, shown: consistent ? { pub, hand: s.hand } : s.shown };
    }
    case 'hand': {
      const pub = s.room?.publicState ?? null;
      const shown = pub && m.hand && m.hand.version === pub.version ? { pub, hand: m.hand } : s.shown;
      return { ...s, hand: m.hand, shown };
    }
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface MoveRequest {
  type: ActionType;
  value?: number | null;
  cardId?: string | null;
}

interface OnlineContextValue {
  configured: boolean;
  online: boolean;
  uid: string | null;
  busy: string | null;
  error: string | null;
  clearError: () => void;
  roomCode: string | null;
  room: RoomDoc | null;
  players: PlayerDoc[];
  isHost: boolean;
  /** My seat in room terms (null = not seated / spectating). */
  mySeat: Seat | null;
  /** Has the room data been confirmed by the server (not just the offline cache)? */
  synced: boolean;
  /** uid → is that player's heartbeat recent? */
  connected: (uid: string) => boolean;
  /** Set when the room ended for us (host left, room closed…). */
  closedReason: string | null;
  view: LocalView | null;
  legalIds: Set<string>;
  canReveal: boolean;
  isMyTurn: boolean;
  /** Waiting for the host to accept my last move. */
  pendingMove: boolean;
  moveError: { message: string; seq: number } | null;
  createRoom: () => Promise<string | null>;
  joinRoom: (code: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  takeSeat: (index: number) => void;
  addBot: (index: number) => void;
  removeBot: (index: number) => void;
  startGame: () => void;
  move: (request: MoveRequest) => boolean;
  nextHand: () => void;
  restartMatch: () => void;
}

const OnlineContext = createContext<OnlineContextValue | null>(null);

export function useOnline(): OnlineContextValue {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error('useOnline must be used inside <OnlineRoomProvider>');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OnlineRoomProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const toast = useToast();
  const feedback = useFeedback();
  const online = useIsOnline();
  const myName = settings.playerName.trim() || 'Player';

  const [uid, setUid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [localClosed, setLocalClosed] = useState<string | null>(null);
  const [net, dispatch] = useReducer(netReducer, EMPTY_NET);
  const [moveError, setMoveError] = useState<{ message: string; seq: number } | null>(null);
  const [pendingVersion, setPendingVersion] = useState<number | null>(null);
  /** Bumped when the app returns to the foreground → listeners re-attach and resync. */
  const [resubscribe, setResubscribe] = useState(0);
  /** Clock tick (5 s) for presence checks. */
  const [now, setNow] = useState(() => Date.now());

  const hostRef = useRef<HostController | null>(null);
  const [host, setHost] = useState<HostController | null>(null);
  const errorSeq = useRef(0);

  // ---- host controller state (re-render whenever it changes) ----
  const subscribeHost = useCallback((fn: () => void) => (host ? host.subscribe(fn) : () => undefined), [host]);
  const hostVersion = useSyncExternalStore(subscribeHost, () => host?.version ?? -1, () => -1);

  // ---- presence: when did each player's heartbeat last change (local clock) ----
  const [beats, setBeats] = useState<Record<string, { beat: number; at: number }>>({});
  const onPlayers = useCallback((players: PlayerDoc[]) => {
    const t = Date.now();
    setBeats((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of players) {
        if (!prev[p.uid] || prev[p.uid].beat !== p.heartbeat) {
          next[p.uid] = { beat: p.heartbeat, at: t };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    dispatch({ type: 'players', players });
  }, []);

  const connected = useCallback(
    (id: string) => {
      const seen = beats[id];
      return !!seen && now - seen.at <= DISCONNECT_MS && net.players.some((p) => p.uid === id);
    },
    [beats, now, net.players],
  );

  // ---- listeners for the current room ----
  useEffect(() => {
    if (!roomCode || !uid) return;
    const onError = (e: unknown) => setError(svc.roomErrorMessage(e));
    const unsubs = [
      svc.listenRoom(roomCode, (room, fromCache) => dispatch({ type: 'room', room, fromCache, uid }), onError),
      svc.listenPlayers(roomCode, onPlayers, onError),
      svc.listenHand(roomCode, uid, (hand) => dispatch({ type: 'hand', hand }), () => undefined),
    ];
    return () => unsubs.forEach((u) => u());
  }, [roomCode, uid, onPlayers, resubscribe]);

  // ---- my rejected requests → friendly error ----
  const seenRejections = useRef(new Set<string>());
  useEffect(() => {
    if (!roomCode || !uid || hostRef.current) return;
    const unsub = svc.listenMyActions(
      roomCode,
      uid,
      (actions) => {
        for (const a of actions) {
          if (a.doc.status === 'pending' || seenRejections.current.has(a.id)) continue;
          seenRejections.current.add(a.id);
          setPendingVersion(null);
          if (a.doc.status === 'rejected') {
            errorSeq.current += 1;
            setMoveError({ message: a.doc.reason ?? 'That move was not allowed.', seq: errorSeq.current });
            feedback.error();
            toast.show(a.doc.reason ?? 'That move was not allowed.', 'error');
          }
        }
      },
      () => undefined,
    );
    return unsub;
  }, [roomCode, uid, resubscribe, feedback, toast]);

  // ---- heartbeat + presence clock ----
  useEffect(() => {
    if (!roomCode || !uid) return;
    let beat = Math.floor(Math.random() * 1000);
    const send = () => svc.heartbeat(roomCode, uid, ++beat, myName).catch(() => undefined);
    send();
    const hb = setInterval(send, HEARTBEAT_MS);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      clearInterval(hb);
      clearInterval(tick);
    };
  }, [roomCode, uid, myName, resubscribe]);

  // ---- back from the background → resync ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setResubscribe((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  // ---- HOST: process pending requests, seat requests, presence ----
  useEffect(() => {
    if (!host || !roomCode) return;
    const processed = new Set<string>();
    const unsub = svc.listenPendingActions(
      roomCode,
      (actions) => {
        for (const a of actions) {
          if (processed.has(a.id)) continue;
          processed.add(a.id);
          host.handleAction(a.id, a.doc);
        }
      },
      (e) => setError(svc.roomErrorMessage(e)),
    );
    return unsub;
  }, [host, roomCode, resubscribe]);

  useEffect(() => {
    if (!host) return;
    host.syncSeatRequests(net.players);
    // Lobby: a seated player whose player document disappeared has left.
    if (host.status === 'lobby') {
      for (const s of host.seats) if (s.uid && !s.isBot && !net.players.some((p) => p.uid === s.uid)) host.removePlayer(s.uid);
    }
  }, [host, net.players]);

  useEffect(() => {
    if (!host || !uid) return;
    const seen = Object.fromEntries(Object.entries(beats).map(([id, v]) => [id, v.at]));
    for (const s of host.seats) if (s.uid && !net.players.some((p) => p.uid === s.uid)) seen[s.uid] = 0; // left the room
    host.replaceDisconnected(staleSeats(host.seats, seen, now, DISCONNECT_MS, uid));
  }, [host, uid, now, beats, net.players]);

  // ---- HOST: deals and bots ----
  const hostGame = host?.game ?? null;
  useEffect(() => {
    if (!host || !hostGame || host.status === 'closed') return;
    if (hostGame.phase === 'DEAL_5' || hostGame.phase === 'DEAL_REST') {
      const t = setTimeout(() => host.finishDeal(), dealDuration(hostGame.phase));
      return () => clearTimeout(t);
    }
    const bot = host.botToAct();
    if (bot === null) return;
    const [min, max] = BOT_DELAY[settings.botSpeed];
    // Give everyone time to see a finished trick before a bot leads the next one.
    const trickJustEnded = hostGame.currentTrick.plays.length === 0 && hostGame.completedTricks.length > 0;
    const delay = min + Math.random() * (max - min) + (trickJustEnded ? TRICK_HOLD_MS + TRICK_SWEEP_MS : 0);
    const t = setTimeout(() => host.playBot(bot, settings.difficulty), delay);
    return () => clearTimeout(t);
  }, [host, hostGame, hostVersion, settings.botSpeed, settings.difficulty]);

  // ---- derived room info ----
  const room = net.room;
  const isHost = !!host || (!!room && !!uid && room.hostUid === uid);
  // hostVersion changes whenever the host's seats change.
  const seats = useMemo(() => (host && hostVersion >= 0 ? host.seats : (room?.seats ?? NO_SEATS)), [host, hostVersion, room]);
  const mySeat = uid && seats.length ? seatOf(seats, uid) : null;

  // The host renders straight from its own state (always consistent, no network delay).
  // hostVersion changes whenever the controller commits, so these recompute exactly then.
  const hostShown = useMemo(() => {
    const g = host?.game;
    if (!host || !g || hostVersion < 0) return null;
    const seat = uid ? seatOf(host.seats, uid) : null;
    return {
      pub: toPublicState(g, host.version, host.handId),
      hand: seat !== null ? handDocFor(g, seat, host.version, host.handId) : null,
    };
  }, [host, hostVersion, uid]);
  const shownPub = hostShown ? hostShown.pub : net.shown.pub;
  const shownHand = hostShown ? hostShown.hand : net.shown.hand;

  const view = useMemo<LocalView | null>(
    () => (shownPub ? toLocalView(shownPub, shownHand, mySeat, seats, myName) : null),
    [shownPub, shownHand, mySeat, seats, myName],
  );

  // Host gone (no heartbeat for a while) → the room is over for us.
  const hostGone =
    !host && !!room && room.status !== 'closed' && beats[room.hostUid] !== undefined && now - beats[room.hostUid].at > HOST_GONE_MS;
  const closedReason =
    localClosed ?? (room?.status === 'closed' ? (room.closedReason ?? 'The room was closed.') : hostGone ? 'The host left the room.' : null);

  const legalIds = useMemo(() => new Set(view && mySeat !== null ? getLegalCards(view.game, 0).map((c) => c.id) : []), [view, mySeat]);
  const currentVersion = shownPub?.version ?? -1;
  const pendingMove = pendingVersion !== null && pendingVersion === currentVersion;
  const isMyTurn = !!view && mySeat !== null && view.game.turn === 0 && view.game.phase !== 'HAND_OVER';
  const canReveal = !!view && mySeat !== null && !pendingMove && revealError(view.game, 0) === null;

  // ---- actions ----

  const ensureUser = useCallback(async () => {
    if (!isFirebaseConfigured) throw new svc.RoomError('Online play needs Firebase, which is not configured.');
    const user = await ensureSignedIn().catch((e) => {
      throw new svc.RoomError(authErrorMessage(e));
    });
    setUid(user.uid);
    return user.uid;
  }, []);

  const resetRoomState = useCallback(() => {
    hostRef.current = null;
    setHost(null);
    setRoomCode(null);
    setLocalClosed(null);
    setPendingVersion(null);
    setMoveError(null);
    setBeats({});
    seenRejections.current = new Set();
    dispatch({ type: 'reset' });
  }, []);

  const createRoom = useCallback(async () => {
    setError(null);
    setBusy('Creating your room…');
    try {
      const id = await ensureUser();
      const code = await svc.createRoom(id, myName);
      resetRoomState();
      const seats = [{ uid: id, name: myName, isBot: false, team: 'A' as const, replacedUid: null, replacedName: null }];
      const controller = new HostController(svc.firestoreHostStore(code), id, [
        seats[0],
        { uid: null, name: '', isBot: false, team: 'B', replacedUid: null, replacedName: null },
        { uid: null, name: '', isBot: false, team: 'A', replacedUid: null, replacedName: null },
        { uid: null, name: '', isBot: false, team: 'B', replacedUid: null, replacedName: null },
      ]);
      hostRef.current = controller;
      setHost(controller);
      setRoomCode(code);
      return code;
    } catch (e) {
      setError(svc.roomErrorMessage(e));
      return null;
    } finally {
      setBusy(null);
    }
  }, [ensureUser, myName, resetRoomState]);

  const joinRoom = useCallback(
    async (code: string) => {
      setError(null);
      setBusy('Joining room…');
      try {
        const id = await ensureUser();
        const room = await svc.joinRoom(code, id, myName);
        resetRoomState();
        if (room.hostUid === id) {
          // We are this room's host but our game state was lost (app restarted).
          if (room.status === 'lobby') {
            const controller = new HostController(svc.firestoreHostStore(code), id, room.seats);
            hostRef.current = controller;
            setHost(controller);
          } else {
            const controller = new HostController(svc.firestoreHostStore(code), id, room.seats);
            await controller.close('The host restarted the app — the game ended.');
            throw new svc.RoomError('Your previous game was lost when the app restarted, so the room was closed.');
          }
        }
        setRoomCode(code);
        return true;
      } catch (e) {
        setError(svc.roomErrorMessage(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [ensureUser, myName, resetRoomState],
  );

  const leaveRoom = useCallback(async () => {
    const code = roomCode;
    const me = uid;
    const controller = hostRef.current;
    resetRoomState();
    if (!code || !me) return;
    if (controller) await controller.close(`${myName} (the host) left the room.`).catch(() => undefined);
    await svc.leaveRoom(code, me);
  }, [roomCode, uid, myName, resetRoomState]);

  const takeSeat = useCallback(
    (index: number) => {
      if (!roomCode || !uid) return;
      svc.requestSeat(roomCode, uid, index).catch((e) => toast.show(svc.roomErrorMessage(e), 'error'));
    },
    [roomCode, uid, toast],
  );
  const addBot = useCallback((index: number) => {
    const err = hostRef.current?.addBot(index);
    if (err) toast.show(err, 'error');
  }, [toast]);
  const removeBot = useCallback((index: number) => {
    const err = hostRef.current?.removeBot(index);
    if (err) toast.show(err, 'error');
  }, [toast]);
  const startGame = useCallback(() => {
    const err = hostRef.current?.startGame();
    if (err) toast.show(err, 'error');
  }, [toast]);
  const nextHand = useCallback(() => {
    const err = hostRef.current?.nextHand(connected);
    if (err) toast.show(err, 'error');
  }, [connected, toast]);
  const restartMatch = useCallback(() => {
    const err = hostRef.current?.restartMatch(connected);
    if (err) toast.show(err, 'error');
  }, [connected, toast]);

  /** A move by the local player: checked locally first, then applied (host) or sent (others). */
  const move = useCallback(
    (request: MoveRequest): boolean => {
      if (!view || mySeat === null || !roomCode || !uid || pendingMove) return false;
      const local = applyAction(view.game, { ...request, seat: 0 } as never);
      const fail = (message: string) => {
        errorSeq.current += 1;
        setMoveError({ message, seq: errorSeq.current });
        feedback.error();
        return false;
      };
      if (!local.ok) return fail(local.error);
      setMoveError(null);
      const controller = hostRef.current;
      if (controller) {
        const err = controller.hostMove({ type: request.type, value: request.value ?? null, cardId: request.cardId ?? null });
        return err ? fail(err) : true;
      }
      if (!online) return fail('You are offline — reconnect to keep playing.');
      setPendingVersion(currentVersion);
      svc.sendAction(roomCode, uid, request, currentVersion).catch((e) => {
        setPendingVersion(null);
        fail(svc.roomErrorMessage(e));
      });
      return true;
    },
    [view, mySeat, roomCode, uid, pendingMove, feedback, online, currentVersion],
  );

  // Leaving the online section: stop everything.
  useEffect(
    () => () => {
      const controller = hostRef.current;
      if (controller) controller.close('The host left the room.').catch(() => undefined);
    },
    [],
  );

  const value: OnlineContextValue = {
    configured: isFirebaseConfigured,
    online,
    uid,
    busy,
    error,
    clearError: () => setError(null),
    roomCode,
    room: host && room ? { ...room, seats: host.seats, status: host.status } : room,
    players: net.players,
    isHost,
    mySeat,
    synced: host ? true : !!room && !net.fromCache,
    connected,
    closedReason,
    view,
    legalIds,
    canReveal,
    isMyTurn,
    pendingMove,
    moveError: moveError,
    createRoom,
    joinRoom,
    leaveRoom,
    takeSeat,
    addBot,
    removeBot,
    startGame,
    move,
    nextHand,
    restartMatch,
  };

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>;
}
