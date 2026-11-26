/**
 * online.test.ts — the online layer, tested with a FAKE Firestore store
 * (FakeStore records every batched write the host would send).
 *
 * Covers: room codes; hidden information never published; action validation
 * through the engine (out-of-turn, stale, unseated, double taps); seat races;
 * bot replacement on disconnect (and getting the seat back); the local view
 * rotation; and complete hands played over the "network".
 */
import { decideBotAction } from '@/game/ai';
import { mulberry32 } from '@/game/deck';
import { getPublicView } from '@/game/engine';
import { legalCards } from '@/game/rules';
import type { GameState, Seat } from '@/game/types';

import { HostController, HostStore, HostWrite, STALE_REASON } from '../HostController';
import { assignSeatRequests, botSeat, emptySeats, handDocFor, staleSeats, toLocalView, toPublicState } from '../protocol';
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET, roomCodeError } from '../roomCode';
import type { ActionDoc, PlayerDoc, RoomSeat } from '../types';

// ---------------------------------------------------------------------------
// Fake Firestore
// ---------------------------------------------------------------------------

class FakeStore implements HostStore {
  writes: HostWrite[] = [];
  async write(w: HostWrite) {
    this.writes.push(JSON.parse(JSON.stringify(w)));
  }
  get last() {
    return this.writes[this.writes.length - 1];
  }
  lastRoomWrite() {
    return [...this.writes].reverse().find((w) => w.room !== null)!;
  }
}

const UIDS = ['host', 'ali', 'bina', 'chen'];

/** Four human players seated, host in seat 0. */
function fourHumans(): RoomSeat[] {
  return emptySeats().map((s, i) => ({ ...s, uid: UIDS[i], name: UIDS[i] }));
}

/** Host + one friend (seat 2, the host's partner) + two bots. */
function twoHumansTwoBots(): RoomSeat[] {
  const seats = emptySeats();
  seats[0] = { ...seats[0], uid: 'host', name: 'Host' };
  seats[2] = { ...seats[2], uid: 'ali', name: 'Ali' };
  seats[1] = botSeat(1);
  seats[3] = botSeat(3);
  return seats;
}

let actionSeq = 0;
function request(c: HostController, uid: string, move: Partial<ActionDoc>, version = c.version): ActionDoc {
  return { uid, type: 'PASS', value: null, cardId: null, version, status: 'pending', reason: null, ...move } as ActionDoc;
}
const send = (c: HostController, uid: string, move: Partial<ActionDoc>, version?: number) =>
  c.handleAction(`a${++actionSeq}`, request(c, uid, move, version));

/** The move a human player "taps", chosen by the AI from that player's public view. */
function humanMove(game: GameState, seat: Seat): Partial<ActionDoc> {
  const m = decideBotAction(getPublicView(game, seat), 'normal', mulberry32(seat + game.completedTricks.length * 7))!;
  switch (m.type) {
    case 'BID':
      return { type: 'BID', value: m.value };
    case 'CHOOSE_RANG':
      return { type: 'CHOOSE_RANG', cardId: m.cardId };
    case 'PLAY_CARD':
      return { type: 'PLAY_CARD', cardId: m.cardId };
    case 'REVEAL_RANG':
      return { type: 'REVEAL_RANG' };
    default:
      return { type: 'PASS' };
  }
}

/**
 * Secret = any card still in someone's hand, plus the face-down Rang before
 * the reveal. (Once revealed, the Rang card is shown to everyone by the rules,
 * even though it goes back into the bidder's hand.)
 */
function secretIds(g: GameState): string[] {
  const publicRang = g.rangRevealed ? g.rangCard?.id : undefined;
  const ids = g.hands.flat().map((c) => c.id).filter((id) => id !== publicRang);
  if (g.hiddenCard && !g.rangRevealed) ids.push(g.hiddenCard.id);
  return ids;
}

/** Checks the last write leaks nothing and gives each human only their own cards. */
function assertNoLeaks(c: HostController, store: FakeStore) {
  const g = c.game!;
  const w = store.lastRoomWrite();
  const roomJson = JSON.stringify(w.room);
  for (const id of secretIds(g)) expect(roomJson).not.toContain(`"${id}"`);
  for (const key of ['"hands"', '"stock"', '"handSeed"', '"hiddenCard"']) expect(roomJson).not.toContain(key);
  if (!g.rangRevealed) expect(w.room!.publicState!.rangSuit).toBeNull();
  for (const h of w.hands) {
    const seat = c.seats.findIndex((s) => s.uid === h.uid);
    expect(h.doc.cards.map((x) => x.id).sort()).toEqual(g.hands[seat].map((x) => x.id).sort());
    if (g.bidder !== seat) expect(h.doc.hiddenCard).toBeNull();
  }
}

/** Plays until the hand is over: bots on the host, humans via action requests. Checks leaks after every step. */
async function playHand(c: HostController, store: FakeStore) {
  for (let guard = 0; guard < 400 && c.game!.phase !== 'HAND_OVER'; guard++) {
    const g = c.game!;
    if (g.phase === 'DEAL_5' || g.phase === 'DEAL_REST') c.finishDeal();
    else if (c.botToAct() !== null) c.playBot(c.botToAct()!);
    else {
      const seat = g.turn;
      const uid = c.seats[seat].uid!;
      const move = humanMove(g, seat);
      if (uid === c.hostUid) expect(c.hostMove({ type: move.type!, value: move.value ?? null, cardId: move.cardId ?? null })).toBeNull();
      else expect(send(c, uid, move)).toEqual({ status: 'applied' });
    }
    await c.flush();
    assertNoLeaks(c, store);
  }
}

// ---------------------------------------------------------------------------
// Room codes
// ---------------------------------------------------------------------------

describe('room codes', () => {
  it('are 6 characters from an alphabet without look-alikes', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(6);
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[01OIL]/);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('validates typed input with helpful messages', () => {
    expect(normalizeRoomCode(' k7m-q2x ')).toBe('K7MQ2X');
    expect(roomCodeError('K7MQ2X')).toBeNull();
    expect(roomCodeError('')).toMatch(/Enter/);
    expect(roomCodeError('ABC')).toMatch(/6 characters/);
    expect(roomCodeError('ABCDE0')).toMatch(/never contain/);
  });
});

// ---------------------------------------------------------------------------
// Hidden information
// ---------------------------------------------------------------------------

describe('hidden information', () => {
  it('is never written to the public room document during two full hands', async () => {
    const store = new FakeStore();
    const c = new HostController(store, 'host', fourHumans(), mulberry32(42));
    expect(c.startGame()).toBeNull();
    await playHand(c, store);
    expect(c.status).toBe('handOver');
    expect(c.nextHand()).toBeNull();
    await playHand(c, store);
  });

  it('only the bidder’s hand document contains the face-down Rang card', () => {
    const store = new FakeStore();
    const c = new HostController(store, 'host', fourHumans(), mulberry32(3));
    c.startGame();
    c.finishDeal();
    while (c.game!.phase === 'BIDDING') send(c, c.seats[c.game!.turn].uid!, { type: 'PASS' }); // all pass → forced bidder
    const bidder = c.game!.bidder!;
    const ref = c.game!.hands[bidder][0];
    if (bidder === 0) c.hostMove({ type: 'CHOOSE_RANG', value: null, cardId: ref.id });
    else send(c, c.seats[bidder].uid!, { type: 'CHOOSE_RANG', cardId: ref.id });
    const g = c.game!;
    const pub = toPublicState(g, c.version, c.handId);
    expect(pub.rangPlaced).toBe(true);
    expect(pub.rangSuit).toBeNull();
    expect(pub.rangCard).toBeNull();
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const doc = handDocFor(g, seat, c.version, c.handId);
      expect(doc.hiddenCard?.id ?? null).toBe(seat === bidder ? ref.id : null);
    }
  });
});

// ---------------------------------------------------------------------------
// Action validation through the engine
// ---------------------------------------------------------------------------

describe('action requests', () => {
  /** Started game, dealt, in BIDDING, with a REMOTE player (not the host) to bid first. */
  function bidding() {
    for (let seed = 1; seed < 100; seed++) {
      const store = new FakeStore();
      const c = new HostController(store, 'host', fourHumans(), mulberry32(seed));
      c.startGame();
      c.finishDeal();
      if (c.seats[c.game!.turn].uid !== 'host' && c.seats[(c.game!.turn + 1) % 4].uid !== 'host' && c.seats[(c.game!.turn + 2) % 4].uid !== 'host')
        return { c, store };
    }
    throw new Error('no suitable seed');
  }
  /** Lets the remote player whose turn it is pass. */
  const passNow = (c: HostController) => send(c, c.seats[c.game!.turn].uid!, { type: 'PASS' });

  it('applies a legal move and bumps the version', async () => {
    const { c, store } = bidding();
    const before = c.version;
    expect(passNow(c)).toEqual({ status: 'applied' });
    await c.flush();
    expect(c.version).toBe(before + 1);
    expect(store.last.actions[0]).toMatchObject({ status: 'applied' });
  });

  it('rejects out-of-turn moves with the engine’s reason and changes nothing', async () => {
    const { c, store } = bidding();
    const notTurn = c.seats.find((s, i) => i !== c.game!.turn && s.uid !== 'host')!.uid!;
    const before = c.version;
    const game = c.game;
    const res = send(c, notTurn, { type: 'PASS' });
    await c.flush();
    expect(res).toEqual({ status: 'rejected', reason: 'It is not your turn to bid.' });
    expect(c.version).toBe(before);
    expect(c.game).toBe(game);
    expect(store.last.room).toBeNull(); // only the action status is written
    expect(store.last.actions[0]).toMatchObject({ status: 'rejected', reason: 'It is not your turn to bid.' });
  });

  it('rejects stale moves made before the current turn began', () => {
    const { c } = bidding();
    const oldVersion = c.version; // the third bidder is looking at this version…
    passNow(c);
    passNow(c); // …but two calls happen before it is their turn
    const uid = c.seats[c.game!.turn].uid!;
    expect(send(c, uid, { type: 'BID', value: 8 }, oldVersion)).toEqual({ status: 'rejected', reason: STALE_REASON });
    expect(send(c, uid, { type: 'BID', value: 8 })).toEqual({ status: 'applied' }); // with a fresh version it works
  });

  it('rejects players who are not seated, and malformed requests', () => {
    const { c } = bidding();
    expect(send(c, 'stranger', { type: 'PASS' })).toEqual({ status: 'rejected', reason: 'You are not seated at this table.' });
    const uid = c.seats[c.game!.turn].uid!;
    expect(send(c, uid, { type: 'BID', value: null })).toEqual({ status: 'rejected', reason: 'That move could not be understood.' });
  });

  it('a double tap (same move twice) is applied once and then rejected', () => {
    const { c } = bidding();
    const uid = c.seats[c.game!.turn].uid!;
    const version = c.version;
    expect(send(c, uid, { type: 'BID', value: 8 }, version)).toEqual({ status: 'applied' });
    expect(send(c, uid, { type: 'BID', value: 8 }, version)).toMatchObject({ status: 'rejected' });
  });

  it('rejects moves when no game is running', () => {
    const c = new HostController(new FakeStore(), 'host', fourHumans());
    expect(send(c, 'ali', { type: 'PASS' })).toEqual({ status: 'rejected', reason: 'The game is not in progress.' });
  });
});

// ---------------------------------------------------------------------------
// Lobby, bots and disconnects
// ---------------------------------------------------------------------------

describe('seats, bots and disconnects', () => {
  const player = (uid: string, wantsSeat: number | null): PlayerDoc => ({ uid, name: uid, wantsSeat, heartbeat: 1 });

  it('when two players ask for the same seat, only the first gets it', () => {
    const seats = emptySeats();
    seats[0] = { ...seats[0], uid: 'host', name: 'host' };
    const next = assignSeatRequests(seats, [player('host', 0), player('ali', 2), player('bina', 2)]);
    expect(next[2].uid).toBe('ali');
    expect(next.some((s) => s.uid === 'bina')).toBe(false);
  });

  it('the host fills empty seats with bots and can only start when all four are filled', () => {
    const store = new FakeStore();
    const seats = emptySeats();
    seats[0] = { ...seats[0], uid: 'host', name: 'host' };
    const c = new HostController(store, 'host', seats);
    expect(c.startGame()).toMatch(/Fill every seat/);
    c.addBot(1);
    c.addBot(2);
    c.addBot(3);
    expect(c.removeBot(2)).toBeNull();
    expect(c.startGame()).toMatch(/Fill every seat/);
    c.addBot(2);
    expect(c.startGame()).toBeNull();
    expect(c.status).toBe('playing');
  });

  it('a game with 2 humans + 2 bots plays to the end', async () => {
    const store = new FakeStore();
    const c = new HostController(store, 'host', twoHumansTwoBots(), mulberry32(5));
    c.startGame();
    await playHand(c, store);
    expect(c.game!.phase).toBe('HAND_OVER');
    expect(c.game!.tricksWon.A + c.game!.tricksWon.B).toBe(13);
  });

  it('finds players whose heartbeat stopped (but never the host or bots)', () => {
    const seats = twoHumansTwoBots();
    expect(staleSeats(seats, { host: 0, ali: 0 }, 40_000, 30_000, 'host')).toEqual([2]);
    expect(staleSeats(seats, { host: 0, ali: 35_000 }, 40_000, 30_000, 'host')).toEqual([]);
  });

  it('replaces a disconnected player with a bot, announces it, and gives the seat back next hand', async () => {
    const store = new FakeStore();
    const c = new HostController(store, 'host', twoHumansTwoBots(), mulberry32(8));
    c.startGame();
    c.replaceDisconnected([2]);
    await c.flush();
    expect(c.seats[2]).toMatchObject({ isBot: true, uid: null, replacedUid: 'ali' });
    expect(store.lastRoomWrite().room!.notice!.text).toMatch(/Ali disconnected/);
    // The bot now plays Ali's seat until the hand ends.
    await playHand(c, store);
    expect(c.nextHand((uid) => uid === 'ali')).toBeNull();
    expect(c.seats[2]).toMatchObject({ uid: 'ali', isBot: false });
  });

  it('in the lobby a vanished player simply frees their seat', () => {
    const c = new HostController(new FakeStore(), 'host', twoHumansTwoBots());
    c.replaceDisconnected([2]);
    expect(c.seats[2]).toMatchObject({ uid: null, isBot: false });
  });

  it('closing the room publishes status "closed" with a reason', async () => {
    const store = new FakeStore();
    const c = new HostController(store, 'host', twoHumansTwoBots());
    await c.close('The host left the room.');
    expect(store.lastRoomWrite().room).toMatchObject({ status: 'closed', closedReason: 'The host left the room.' });
  });
});

// ---------------------------------------------------------------------------
// Local view: every player sees themselves at the bottom
// ---------------------------------------------------------------------------

describe('toLocalView', () => {
  it('rotates seats so I am South, my partner North and my team "A"', () => {
    const store = new FakeStore();
    const c = new HostController(store, 'host', fourHumans(), mulberry32(11));
    c.startGame();
    c.finishDeal();
    const g = c.game!;
    const pub = toPublicState(g, c.version, c.handId);
    const mySeat = 1 as Seat; // 'ali' is West in room terms, Team B
    const view = toLocalView(pub, handDocFor(g, mySeat, c.version, c.handId), mySeat, c.seats, 'Ali');
    expect(view.game.hands[0].map((x) => x.id)).toEqual(g.hands[1].map((x) => x.id));
    expect(view.players[0].name).toBe('Ali');
    expect(view.players[2].name).toBe('chen'); // partner opposite
    expect(view.game.turn).toBe(((g.turn - 1 + 4) % 4) as Seat);
    expect(view.game.dealer).toBe(((g.dealer - 1 + 4) % 4) as Seat);
    // My team (B in room terms) is "A" (Us) in my view.
    expect(view.game.score).toEqual({ A: g.score.B, B: g.score.A });
    // Opponents' cards are only placeholders (counts), never real cards.
    for (const v of [1, 2, 3]) expect(view.game.hands[v].every((x) => x.id.startsWith('hidden-'))).toBe(true);
    // Legal plays computed on the view match the real game for my seat.
    expect(legalCards(view.game.hands[0], view.game.currentTrick).length).toBe(g.hands[1].length);
  });

  it('a spectator (replaced player) sees no cards in their own hand', () => {
    const c = new HostController(new FakeStore(), 'host', fourHumans(), mulberry32(2));
    c.startGame();
    const view = toLocalView(toPublicState(c.game!, c.version, c.handId), null, null, c.seats, 'Me');
    expect(view.game.hands[0]).toEqual([]);
  });
});
