/**
 * HostController.ts — the authoritative game loop that runs on the HOST's device.
 *
 * Host-authoritative design: only the host holds the full GameState and runs
 * the (unchanged) game engine. Other players send action requests; the host
 * validates each one with the engine and publishes the result:
 *
 *   player taps → ActionDoc (pending) → handleAction():
 *       1. is the sender seated?            (else reject)
 *       2. is the request stale?            (made before the current turn began → reject)
 *       3. engine.applyAction(state, move)  (illegal → reject with the engine's reason)
 *       4. version++ → publish RoomDoc (public state) + each player's HandDoc
 *          + the action's status, in ONE batched write (HostStore.write)
 *
 * Bots (empty seats, or players who disconnected) also play here, using the
 * same ai.ts as single-player. Plain TypeScript — no React, no Firebase — so it
 * is unit-tested with a fake HostStore.
 */
import { decideBotAction } from '@/game/ai';
import { applyAction, createMatch, getPublicView } from '@/game/engine';
import type { GameState, Seat } from '@/game/types';

import {
  allSeatsFilled,
  assignSeatRequests,
  botSeat,
  emptySeat,
  handDocFor,
  replaceWithBot,
  restoreReturning,
  seatOf,
  toGameAction,
  toPublicState,
  vacate,
} from './protocol';
import type { ActionDoc, HandDoc, Notice, PlayerDoc, RoomDoc, RoomSeat, RoomStatus } from './types';

/** One batched write: the room document, private hands, and action results. */
export interface HostWrite {
  /** Null when only action results change (e.g. a rejected request). */
  room: Pick<RoomDoc, 'status' | 'seats' | 'publicState' | 'notice' | 'closedReason'> | null;
  hands: { uid: string; doc: HandDoc }[];
  actions: { id: string; status: 'applied' | 'rejected'; reason: string | null }[];
}

/** Where the host writes. Firestore in the app (roomService.firestoreHostStore), a fake in tests. */
export interface HostStore {
  write(w: HostWrite): Promise<void>;
}

export type ActionOutcome = { status: 'applied' } | { status: 'rejected'; reason: string };

export const STALE_REASON = 'That move was based on an old view of the table — please try again.';

export class HostController {
  game: GameState | null = null;
  status: RoomStatus = 'lobby';
  seats: RoomSeat[];
  version = 0;
  handId = 0;
  notice: Notice | null = null;
  closedReason: string | null = null;
  /** Last write error (shown to the host; writes keep retrying with the next change). */
  lastWriteError: string | null = null;

  /** Version at which the current turn began — requests made before it are stale. */
  private turnStartedVersion = 0;
  private turnKey = '';
  private writeChain: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private noticeSeq = 0;

  constructor(
    private store: HostStore,
    readonly hostUid: string,
    seats: RoomSeat[],
    private rng: () => number = Math.random,
  ) {
    this.seats = seats.map((s) => ({ ...s }));
  }

  // ---- change notifications (the React hook re-renders on these) ----

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  // ---- lobby ----

  /** Applies seat requests from the players' documents (first come, first served). */
  syncSeatRequests(players: PlayerDoc[]): void {
    if (this.status !== 'lobby') return;
    const next = assignSeatRequests(this.seats, players);
    if (JSON.stringify(next) !== JSON.stringify(this.seats)) this.setSeats(next);
  }

  /** A player left the lobby (or vanished): free their seat. */
  removePlayer(uid: string): void {
    if (this.status !== 'lobby' || seatOf(this.seats, uid) === null) return;
    this.setSeats(vacate(this.seats, uid));
  }

  addBot(index: number): string | null {
    if (this.status !== 'lobby') return 'Bots can only be added in the lobby.';
    if (this.seats[index].uid !== null || this.seats[index].isBot) return 'That seat is taken.';
    this.setSeats(this.seats.map((s, i) => (i === index ? botSeat(i) : s)));
    return null;
  }

  removeBot(index: number): string | null {
    if (this.status !== 'lobby') return 'Bots can only be removed in the lobby.';
    if (!this.seats[index].isBot) return 'There is no bot in that seat.';
    this.setSeats(this.seats.map((s, i) => (i === index ? emptySeat(i) : s)));
    return null;
  }

  private setSeats(seats: RoomSeat[]) {
    this.seats = seats;
    this.commit(this.game, []);
  }

  /** Starts the match when all four seats have a human or a bot. */
  startGame(): string | null {
    if (this.status !== 'lobby') return 'The game has already started.';
    if (!allSeatsFilled(this.seats)) return 'Fill every seat (with players or bots) to start.';
    if (seatOf(this.seats, this.hostUid) === null) return 'Take a seat before starting the game.';
    this.handId = this.newId();
    this.commit(createMatch(this.newId()), []);
    return null;
  }

  // ---- the game ----

  /** Validates and applies a remote player's request. */
  handleAction(id: string, doc: ActionDoc): ActionOutcome {
    const reject = (reason: string): ActionOutcome => {
      this.commitActionsOnly([{ id, status: 'rejected', reason }]);
      return { status: 'rejected', reason };
    };
    if (!this.game || this.status !== 'playing') return reject('The game is not in progress.');
    const seat = seatOf(this.seats, doc.uid);
    if (seat === null) return reject('You are not seated at this table.');
    if (typeof doc.version !== 'number' || doc.version < this.turnStartedVersion) return reject(STALE_REASON);
    const move = toGameAction(doc, seat);
    if (!move) return reject('That move could not be understood.');
    const res = applyAction(this.game, move);
    if (!res.ok) return reject(res.error);
    this.commit(res.state, [{ id, status: 'applied', reason: null }]);
    return { status: 'applied' };
  }

  /** The host's own moves (no network round trip). Returns an error message or null. */
  hostMove(request: Pick<ActionDoc, 'type' | 'value' | 'cardId'>): string | null {
    const seat = seatOf(this.seats, this.hostUid);
    if (!this.game || this.status !== 'playing') return 'The game is not in progress.';
    if (seat === null) return 'You are not seated.';
    const move = toGameAction(request, seat);
    if (!move) return 'That move could not be understood.';
    const res = applyAction(this.game, move);
    if (!res.ok) return res.error;
    this.commit(res.state, []);
    return null;
  }

  /** Ends a deal animation phase (the hook calls this after the deal delay). */
  finishDeal(): void {
    if (!this.game || (this.game.phase !== 'DEAL_5' && this.game.phase !== 'DEAL_REST')) return;
    const res = applyAction(this.game, { type: 'FINISH_DEAL' });
    if (res.ok) this.commit(res.state, []);
  }

  /** The bot seat that should act now, if any. */
  botToAct(): Seat | null {
    const g = this.game;
    if (!g || this.status !== 'playing') return null;
    if (g.phase !== 'BIDDING' && g.phase !== 'CHOOSE_RANG' && g.phase !== 'PLAYING') return null;
    return this.seats[g.turn]?.isBot ? g.turn : null;
  }

  /** Lets the bot in seat `seat` play (same AI as single-player, using only its public view). */
  playBot(seat: Seat, level: 'easy' | 'normal' = 'normal'): void {
    const g = this.game;
    if (!g || this.botToAct() !== seat) return;
    const move = decideBotAction(getPublicView(g, seat), level, this.rng);
    const res = move ? applyAction(g, move) : null;
    if (res?.ok) this.commit(res.state, []);
  }

  /** Host only: deal the next hand. `connected` tells which replaced players are back. */
  nextHand(connected: (uid: string) => boolean = () => false): string | null {
    if (!this.game || this.game.phase !== 'HAND_OVER') return 'Finish the current hand first.';
    const res = applyAction(this.game, { type: 'NEXT_HAND', seed: this.newId() });
    if (!res.ok) return res.error;
    this.seats = restoreReturning(this.seats, connected);
    this.handId = this.newId();
    this.commit(res.state, []);
    return null;
  }

  /** Host only: score back to 0–0 and a fresh first hand. */
  restartMatch(connected: (uid: string) => boolean = () => false): string | null {
    if (!this.game) return 'The game has not started.';
    const res = applyAction(this.game, { type: 'RESTART_MATCH', seed: this.newId() });
    if (!res.ok) return res.error;
    this.seats = restoreReturning(this.seats, connected);
    this.handId = this.newId();
    this.commit(res.state, []);
    return null;
  }

  /**
   * Disconnected humans: during a game a bot takes over their seat (and
   * everyone gets a notice); in the lobby their seat is simply freed.
   */
  replaceDisconnected(indices: number[]): void {
    if (indices.length === 0 || this.status === 'closed') return;
    let seats = this.seats;
    const names: string[] = [];
    for (const i of indices) {
      const s = seats[i];
      if (!s.uid || s.isBot || s.uid === this.hostUid) continue;
      names.push(s.name);
      seats = this.status === 'lobby' ? vacate(seats, s.uid) : replaceWithBot(seats, i);
    }
    if (names.length === 0) return;
    this.seats = seats;
    if (this.status !== 'lobby') {
      this.notice = { id: ++this.noticeSeq, text: `${names.join(', ')} disconnected — a bot took over.` };
    }
    this.commit(this.game, []);
  }

  /** Closes the room for everyone (host left). */
  close(reason: string): Promise<void> {
    this.status = 'closed';
    this.closedReason = reason;
    this.commit(this.game, [], true);
    return this.writeChain;
  }

  /** Resolves once every queued write has been sent. */
  flush(): Promise<void> {
    return this.writeChain;
  }

  // ---- internals ----

  private newId(): number {
    return Math.floor(this.rng() * 0xffffffff);
  }

  private commitActionsOnly(actions: HostWrite['actions']) {
    this.enqueue({ room: null, hands: [], actions });
  }

  /** Accepts a new state: bumps the version, tracks turn changes, publishes. */
  private commit(game: GameState | null, actions: HostWrite['actions'], keepStatus = false) {
    this.game = game;
    this.version += 1;
    if (!keepStatus && this.status !== 'closed' && game) {
      this.status = game.phase === 'HAND_OVER' ? 'handOver' : 'playing';
    }
    if (game) {
      const key = `${this.handId}:${game.phase}:${game.turn}`;
      if (key !== this.turnKey) {
        this.turnKey = key;
        this.turnStartedVersion = this.version;
      }
    }
    this.enqueue({ room: this.roomFields(), hands: this.handWrites(), actions });
    this.emit();
  }

  private roomFields(): NonNullable<HostWrite['room']> {
    return {
      status: this.status,
      seats: this.seats,
      publicState: this.game ? toPublicState(this.game, this.version, this.handId) : null,
      notice: this.notice,
      closedReason: this.closedReason,
    };
  }

  /** Every seated human gets their own up-to-date hand (same version as the public state). */
  private handWrites(): HostWrite['hands'] {
    const g = this.game;
    if (!g) return [];
    return this.seats.flatMap((s, i) => (s.uid && !s.isBot ? [{ uid: s.uid, doc: handDocFor(g, i as Seat, this.version, this.handId) }] : []));
  }

  /** Writes are chained so they reach Firestore in order. */
  private enqueue(w: HostWrite) {
    this.writeChain = this.writeChain
      .then(() => this.store.write(w))
      .then(() => {
        this.lastWriteError = null;
      })
      .catch((e: unknown) => {
        this.lastWriteError = (e as Error)?.message ?? 'Write failed';
        this.emit();
      });
  }
}
