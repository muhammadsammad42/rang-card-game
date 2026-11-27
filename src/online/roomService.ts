/**
 * roomService.ts — all Firestore reads/writes for online rooms.
 *
 * Kept separate from the game logic (HostController, protocol) so the logic
 * can be tested without Firebase. Every listener function returns an
 * unsubscribe function; the room provider calls them all when leaving.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { getDb } from '@/services/firebase';

import type { HostStore, HostWrite } from './HostController';
import { emptySeats, firestoreSafe, humanCount, isSeatOpen, seatOf } from './protocol';
import { generateRoomCode } from './roomCode';
import type { ActionDoc, ActionType, HandDoc, PlayerDoc, ReactionDoc, RoomDoc } from './types';

const ROOMS = 'rooms';

function requireDb(): Firestore {
  const db = getDb();
  if (!db) throw new Error('Online play needs Firebase — it is not configured on this build.');
  return db;
}

/** An error whose message is safe to show to the player. */
export class RoomError extends Error {}

/** Firebase errors → friendly text. */
export function roomErrorMessage(e: unknown): string {
  if (e instanceof RoomError) return e.message;
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'permission-denied') return 'Permission denied — the Firestore security rules may not be published yet.';
  if (code === 'unavailable' || code === 'deadline-exceeded') return 'Could not reach the server. Check your internet connection.';
  return (e as Error)?.message || 'Something went wrong with the room.';
}

/** Creates a room with a fresh, unused code; the host sits in seat 0. */
export async function createRoom(hostUid: string, hostName: string): Promise<string> {
  const db = requireDb();
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateRoomCode();
    const ref = doc(db, ROOMS, code);
    const created = await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) return false; // code in use (or an old room) — try another code
      const seats = emptySeats();
      seats[0] = { ...seats[0], uid: hostUid, name: hostName };
      const room: RoomDoc = {
        code,
        hostUid,
        hostName,
        status: 'lobby',
        seats,
        publicState: null,
        notice: null,
        closedReason: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      tx.set(ref, room);
      return true;
    });
    if (created) {
      await setPlayer(code, hostUid, hostName, 0);
      return code;
    }
  }
  throw new RoomError('Could not create a room code — please try again.');
}

/**
 * Joins an existing room. Clear errors for: no such room, closed, already
 * started (unless you are part of that game), or full.
 */
export async function joinRoom(code: string, uid: string, name: string): Promise<RoomDoc> {
  const db = requireDb();
  const snap = await getDoc(doc(db, ROOMS, code));
  if (!snap.exists()) throw new RoomError(`There is no room with the code ${code}.`);
  const room = snap.data() as RoomDoc;
  if (room.status === 'closed') throw new RoomError('That room has been closed by its host.');
  const mySeat = seatOf(room.seats, uid);
  const wasReplaced = room.seats.some((s) => s.replacedUid === uid);
  if (room.status !== 'lobby' && mySeat === null && !wasReplaced) throw new RoomError('That game has already started.');
  if (room.status === 'lobby' && mySeat === null && humanCount(room.seats) >= 4) throw new RoomError('That room is full.');
  // Ask for the first open seat (the host decides who gets it).
  const firstOpen = room.seats.findIndex(isSeatOpen);
  await setPlayer(code, uid, name, mySeat ?? (room.status === 'lobby' && firstOpen >= 0 ? firstOpen : null));
  return room;
}

async function setPlayer(code: string, uid: string, name: string, wantsSeat: number | null) {
  const player: PlayerDoc = { uid, name, wantsSeat, heartbeat: 0, joinedAt: serverTimestamp(), lastSeen: serverTimestamp() };
  await setDoc(doc(requireDb(), ROOMS, code, 'players', uid), player);
}

/** Ask the host for a seat. */
export function requestSeat(code: string, uid: string, seat: number): Promise<void> {
  return updateDoc(doc(requireDb(), ROOMS, code, 'players', uid), { wantsSeat: seat, lastSeen: serverTimestamp() });
}

/** Presence: bump the heartbeat counter (others watch it change). */
export function heartbeat(code: string, uid: string, beat: number, name: string): Promise<void> {
  return updateDoc(doc(requireDb(), ROOMS, code, 'players', uid), { heartbeat: beat, name, lastSeen: serverTimestamp() });
}

/** Leave: remove my player document (the host frees my lobby seat). */
export async function leaveRoom(code: string, uid: string): Promise<void> {
  await deleteDoc(doc(requireDb(), ROOMS, code, 'players', uid)).catch(() => undefined);
}

/** Sends a move request for the host to validate. */
export async function sendAction(
  code: string,
  uid: string,
  request: { type: ActionType; value?: number | null; cardId?: string | null },
  version: number,
): Promise<void> {
  const action: ActionDoc = {
    uid,
    type: request.type,
    value: request.value ?? null,
    cardId: request.cardId ?? null,
    version,
    status: 'pending',
    reason: null,
    createdAt: serverTimestamp(),
  };
  await addDoc(collection(requireDb(), ROOMS, code, 'actions'), action);
}

/** An emoji reaction from `seat` (my own seat, or — for the host — a bot's seat). See firestore.rules. */
export async function sendReaction(code: string, uid: string, seat: number, emoji: string): Promise<void> {
  const reaction: ReactionDoc = { uid, seat, emoji, t: Date.now(), at: serverTimestamp() };
  await addDoc(collection(requireDb(), ROOMS, code, 'reactions'), reaction);
}

// ---- listeners ----

type OnError = (e: unknown) => void;

export function listenRoom(code: string, onRoom: (room: RoomDoc | null, fromCache: boolean) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    doc(requireDb(), ROOMS, code),
    { includeMetadataChanges: true },
    (snap) => onRoom(snap.exists() ? (snap.data() as RoomDoc) : null, snap.metadata.fromCache),
    onError,
  );
}

export function listenPlayers(code: string, onPlayers: (players: PlayerDoc[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    collection(requireDb(), ROOMS, code, 'players'),
    (snap) => onPlayers(snap.docs.map((d) => d.data() as PlayerDoc)),
    onError,
  );
}

export function listenHand(code: string, uid: string, onHand: (hand: HandDoc | null) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    doc(requireDb(), ROOMS, code, 'hands', uid),
    (snap) => onHand(snap.exists() ? (snap.data() as HandDoc) : null),
    onError,
  );
}

/** Host: every pending request (oldest first). */
export function listenPendingActions(code: string, onActions: (actions: { id: string; doc: ActionDoc }[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    query(collection(requireDb(), ROOMS, code, 'actions'), where('status', '==', 'pending')),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, doc: d.data() as ActionDoc }));
      const time = (a: ActionDoc) => (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
      list.sort((a, b) => time(a.doc) - time(b.doc));
      onActions(list);
    },
    onError,
  );
}

/** A player: my own requests (to show why one was rejected). */
export function listenMyActions(code: string, uid: string, onActions: (actions: { id: string; doc: ActionDoc }[]) => void, onError: OnError): Unsubscribe {
  return onSnapshot(
    query(collection(requireDb(), ROOMS, code, 'actions'), where('uid', '==', uid)),
    (snap) => onActions(snap.docs.map((d) => ({ id: d.id, doc: d.data() as ActionDoc }))),
    onError,
  );
}

/** The real HostStore: one atomic batch per host update. */
export function firestoreHostStore(code: string): HostStore {
  return {
    async write(w: HostWrite) {
      const db = requireDb();
      const batch = writeBatch(db);
      if (w.room) batch.set(doc(db, ROOMS, code), { ...firestoreSafe(w.room), updatedAt: serverTimestamp() }, { merge: true });
      for (const h of w.hands) batch.set(doc(db, ROOMS, code, 'hands', h.uid), firestoreSafe(h.doc));
      for (const a of w.actions) batch.update(doc(db, ROOMS, code, 'actions', a.id), { status: a.status, reason: a.reason });
      await batch.commit();
    },
  };
}

/**
 * New reactions only: the first snapshot (reactions sent before we joined or
 * re-attached) is skipped; after that only newly added documents are passed on.
 */
export function listenReactions(code: string, onReactions: (list: ReactionDoc[]) => void, onError: OnError): Unsubscribe {
  let first = true;
  return onSnapshot(
    query(collection(requireDb(), ROOMS, code, 'reactions'), orderBy('t', 'desc'), limit(5)),
    (snap) => {
      if (first) {
        first = false;
        return;
      }
      const added = snap.docChanges().filter((c) => c.type === 'added').map((c) => c.doc.data() as ReactionDoc);
      if (added.length) onReactions(added.reverse());
    },
    onError,
  );
}
