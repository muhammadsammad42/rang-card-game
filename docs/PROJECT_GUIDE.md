# Rang — Project Guide

This guide is for the viva. It explains how the app is built, what every file does, and how the key flows
work. Each source file also starts with a header comment describing its purpose.

---

## 1. Architecture in one picture

```
┌──────────────────────────── React (UI) ────────────────────────────┐
│ Screens (src/app)  →  Components (src/components)                    │
│        ▲                         │ user taps / swipes                │
│        │ re-render               ▼                                   │
│ GameProvider (src/context) — useReducer(rootReducer) + bot scheduler │
└────────▲─────────────────────────┬──────────────────────────────────┘
         │ new GameState           │ GameAction (validated)
┌────────┴─────────────────────────▼──────────────────────────────────┐
│ Pure game engine (src/game) — NO React, NO timers                     │
│ engine.applyAction(state, action) → { ok, state } | { ok:false, error }│
│ rules.ts  deck.ts  rulesConfig.ts  ai.ts (bots see only PublicView)   │
└──────────────────────────────────────────────────────────────────────┘
          services/ → AsyncStorage (settings, stats, offline queue)
                    → Firebase Cloud Firestore (game history)
```

Why it is built this way:

- **The engine is pure TypeScript.** It is easy to test (352 Jest tests in the whole app) and easy to explain, and it can't
  break because of UI timing.
- **The engine is deterministic given a seed.** Every shuffle uses a seeded RNG (`mulberry32`), so the same
  seed always deals the same cards.
- **React only renders state and turns gestures into actions.** All rules live in the engine.

---

## 2. The game state machine

`GameState.phase` moves through these states:

```
           NEW_MATCH / NEXT_HAND / RESTART_HAND / RESTART_MATCH
                                  │
                                  ▼
 DEAL_5 ──FINISH_DEAL──▶ BIDDING ──4 calls or a 13──▶ CHOOSE_RANG ──CHOOSE_RANG──▶ DEAL_REST
                                                                                    │
                                                                               FINISH_DEAL
                                                                                    ▼
                         HAND_OVER ◀──── 13th trick resolved ──────────────── PLAYING
                             │                                      (PLAY_CARD, REVEAL_RANG)
                             └──NEXT_HAND──▶ DEAL_5 (dealer moves one seat clockwise)
```

| Phase | What happens | Who acts |
|---|---|---|
| `DEAL_5` | 5 cards each, dealt one at a time from the dealer's left. The UI plays the deal animation. | GameProvider dispatches `FINISH_DEAL` after a timer |
| `BIDDING` | One round: each player passes or bids higher (8–13). A 13 ends bidding at once. If all pass, the dealer's left bids 8. | The player whose turn it is |
| `CHOOSE_RANG` | The bidder puts one of their 5 cards face down; its suit is the secret Rang. Then 8 more cards each are dealt. | The bidder |
| `DEAL_REST` | Animation of the second deal. | GameProvider (`FINISH_DEAL`) |
| `PLAYING` | 13 tricks; the bidder leads the first. Reveals happen here. | The player whose turn it is |
| `HAND_OVER` | Result stored in `state.result`; the score is updated. | The human chooses Next Hand / Restart / Home |

The DEAL phases exist only so the UI can animate dealing. GameProvider finishes them on its own timer, so the
game can never get stuck waiting for an animation callback.

---

## 3. How a card play flows (tap → action → reducer → re-render → animation)

1. **Gesture.** In `Hand.tsx`, each card has a Gesture Handler tap and pan gesture (enabled only on your
   turn). These callbacks are *worklets* (they run on the UI thread). They call `scheduleOnRN(onTap, card)`
   to get back to JavaScript.
2. **Screen logic.** `useHandController` (shared by `game.tsx` and `online/game.tsx`):
   - The first tap on a playable card selects it: it lifts and grows with a Reanimated spring (+ haptic).
   - A second tap, or **dragging it onto the glowing drop zone** in the centre (or a firm flick upwards),
     calls `onPlay` → `GameProvider.playCard(cardId)`. Released anywhere else, the card springs back.
   - Tapping an illegal (dimmed) card never reaches the engine: that card shakes, the phone buzzes and the
     status bar says "You must follow ♦ Diamonds" (see §13).
3. **Validation.** `GameProvider.act()` runs `applyAction(state, action)` first.
   - **If illegal:** the state is not touched. It sets `error` (shown in red in the ActionBar), triggers an
     error haptic, and the hand shakes.
   - **If legal:** it dispatches the action to `useReducer`. A lock ref blocks double taps until the next render.
4. **Reducer.** `rootReducer` → `engine.gameReducer` → `playCard()`. This removes the card, adds it to the
   trick, and moves the turn. On the 4th card it calls `resolveTrick()`, and when the bidder has only the
   hidden card left it calls `applyAutoReveal()`.
5. **Re-render.** The new state flows through Context:
   - `TrickArea` mounts a `TrickCard`, which **flies in** from the player's side with `withTiming`.
   - `Hand` re-fans the remaining cards (they slide with `withTiming`).
6. **Trick finished.** GameProvider sees `completedTricks.length` grow.
   - It shows that trick in the **hold** stage: the winner's card glows and the status text says who won.
   - After `TRICK_HOLD_MS` it switches to **sweep**: the cards fly to the winner, or into the middle pile
     after the reveal.
   - Then the trick is cleared. Bots and the human wait during this.
7. **Bots.** The scheduler `useEffect` in GameProvider:
   - When it's a bot's turn, it waits a natural delay (600–1000 ms, set in Settings).
   - It then calls `ai.decideBotAction(getPublicView(state, seat))` and dispatches the result.
   - The timer is cancelled whenever the state changes, the game is paused, the app goes to the background,
     or the Game screen loses focus, so stale moves can't happen.

---

## 4. The hidden Rang and the reveal

- **Choosing.** `CHOOSE_RANG` moves the chosen card from the bidder's hand into `state.hiddenCard`
  (and `rangCard`) and sets `rangSuit`.
  - These fields are secret. The UI shows the suit only if the human is the bidder (a small "yours" badge)
    or after the reveal.
  - Bots receive `getPublicView(state, seat)`, which sets `rangSuit` and `hiddenCard` to `null` unless that
    seat is the bidder or the Rang has been revealed.
- **Who may reveal** (`rules.revealError`):
  - only during PLAYING, only once, and only on your own turn;
  - the **bidder** may reveal at any time on their turn (even when leading);
  - **anyone else** may reveal only when they **cannot follow** the led suit. They can also just discard
    without revealing.
- **Effects of a reveal** (`engine.doReveal`):
  - the hidden card returns to the bidder's hand;
  - `rangRevealed = true`;
  - `revealedAtTrick` and `revealedBy` are recorded.
- **Auto-reveal.** When the bidder's turn arrives and their hand is empty except for the hidden card, the
  engine reveals it automatically (`AUTO_REVEAL_FOR_BIDDER`).
- **Judging tricks** (`rules.trickWinner` / `beats`):
  - **Hidden Rang:** the highest card of the **led suit** wins, and off-suit cards never win.
  - **Revealed Rang:** any Rang card beats any non-Rang card, and the highest Rang card wins. With no Rang
    card in the trick, the highest led-suit card wins.
  - The trick in which the reveal happens is judged with trump rules, because the reveal happens before that
    trick is resolved.
- **UI.** `RangSlot` flips the card in 3-D (Reanimated `rotateY` with `perspective`), plays the LottieFiles
  **rang-reveal** burst, then settles into a gold suit medallion. A toast and a haptic announce who revealed it.

## 5. The middle pile (post-reveal collection)

In `engine.resolveTrick`, once the Rang is revealed:

1. Each won trick goes into `state.pile` instead of a team's total.
2. `state.streak` tracks `{ seat, count }`, meaning consecutive wins by the **same player**:
   - when the same player wins again, the count goes up;
   - when anyone else wins, the streak restarts at 1 for that player.
3. When the count reaches `STREAK_TO_COLLECT` (2), that player's team takes the **whole pile**, including
   the current trick. The streak then resets (`RESET_STREAK_AFTER_COLLECTION`).
4. After trick 13, any tricks left in the pile go to `LEFTOVER_PILE_OWNER` (the winner of the last trick).

Each `TrickRecord.outcome` records what happened (`team`, `pile`, or `collected`). This drives:

- the last-trick peek;
- the History trick log;
- the sparkle Lottie and the toast on collection.

The ActionBar shows the streak, for example "Noor won the last trick — one more win collects 4 tricks
(pile: 3)". The MiddlePile shows a stack of card backs with a count badge.

**Winning.** The bidding team wins if their collected tricks are at least their bid; otherwise the defenders
win (against a bid of 8, the defenders need 6). `rules.lockedWinner` detects when the result can no longer
change, and the InfoStrip then shows "Result decided".

---

## 6. How game history is saved to Firestore

- **Trigger.** When `phase` becomes `HAND_OVER`, GameProvider records local stats and calls
  `historyService.saveHandResult(game, players, durationSeconds)`. A ref guards this so it runs only once
  per hand.
- **Record.** `buildRecord()` creates the document for the `games` collection. It contains:
  - `playerName`, `deviceId` (a random id stored in AsyncStorage), and `createdAt` (`serverTimestamp()`)
    plus `clientCreatedAt`;
  - `dealerSeat`, `bidderSeat`, `bidderName`, `bidderTeam`, `bid`, `rangSuit`, `revealedAtTrick`,
    `revealedBy`;
  - `tricksWon {teamA, teamB}`, `winnerTeam`, `humanWon`, and `durationSeconds`;
  - a compact `trickLog`: the cards played, the winner, and whether the trick went to a team, to the pile,
    or collected the pile.
- **Idempotent write.** `setDoc(doc(db, 'games', deviceId + '-' + timestamp))` uses a fixed id, so a retry
  can never create a duplicate.
- **Offline / not configured.**
  - If Firebase isn't configured, the write fails, or it times out (8 s), the record goes into an
    AsyncStorage queue (`rang.pendingGames.v1`).
  - A small toast says it will sync later, and the result screen shows "Offline — will sync later".
  - `flushQueue()` retries on app start (`StartupSync` in `_layout.tsx`) and whenever History opens.
  - If a retry is rejected, `flushQueue` checks whether the document already exists (a "timed out" save
    may still have reached the server, and the create-only security rules reject an overwrite). If it
    exists, the game counts as uploaded, so it can never stay stuck in the queue.
- **Reading.** `fetchHistory()` queries `where('deviceId', '==', id)`. This is a single-field filter, so no
  composite index is needed. Results are sorted newest-first on the device and merged with games still in
  the queue (marked "not synced").
- **History screen states:** loading (Lottie), empty, error with Retry, not configured, and pull-to-refresh.
  It also shows summary stats (games played, win %, average bid, times as bidder). Tapping a row opens
  `history/[id].tsx` with the full trick-by-trick log.
- **Verified live** against the project `rang-card-game-4c317`, `(default)` database.
  `src/services/__tests__/firebase.integration.test.ts` runs the app's own service code against the real
  database and checks:
  - the database id;
  - save → History query → History Detail;
  - that a queued offline game uploads.

  Run it with `RUN_FIREBASE_IT=1 npx jest firebase.integration`. It is skipped in normal `npm test` runs, so
  the suite still works offline.
- **Config.** The keys live in `.env` (git-ignored). Expo inlines the `EXPO_PUBLIC_*` values into the bundle
  at build time, so restart with `npx expo start --clear` after changing them.

## 7. How the Lottie animations are integrated

1. The JSON files were downloaded from **LottieFiles** into `assets/lottie/`. Credits are in `CREDITS.md`.
2. `src/theme/animations.ts` is the **only** place with `require()` calls for them, so they are easy to swap.
3. `<LottieAnim name="trophy" />` (`components/LottieAnim.tsx`) wraps `LottieView` from `lottie-react-native`.
   - It uses `onAnimationFailure` and an ErrorBoundary.
   - If an animation can't load, it renders nothing (or a fallback) instead of crashing.

| Animation | Where it plays |
|---|---|
| `homeCards` | Home screen (looping ambience) |
| `rangReveal` | RangSlot, when the Rang is revealed |
| `sparkle` | MiddlePile, when a pile is collected |
| `trophy` + `confetti` | ResultModal, on a win |
| `lose` | ResultModal, on a loss (on an ivory medallion so its dark lines show) |
| `loading` | History and History Detail loading states |
| `cloudUpload` | ResultModal, while saving to Firebase |

Reanimated handles everything that moves with the game state: dealing, card lift and drag, the fly-in, the
sweep, the flip, the turn pulse, shakes, button springs and screen fades. Mount animations use `FadeInView`
(a shared value plus `withTiming`) rather than layout `entering` animations, which sometimes stayed invisible
in Expo Go.

---

## 8. Rule decisions (`src/game/rulesConfig.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `MIN_BID` / `MAX_BID` | 8 / 13 | Bid range |
| `FIRST_DEAL_SIZE` / `SECOND_DEAL_SIZE` | 5 / 8 | Cards per player in each deal |
| `FIRST_DEALER` | `'random'` | Who deals hand 1 (from the match seed) |
| `FIRST_BIDDER_OFFSET` | 1 | The dealer's left bids first |
| `ALL_PASS_BIDDER_OFFSET` / `ALL_PASS_FORCED_BID` | 1 / 8 | If all pass, the dealer's left must bid 8 |
| `MAX_BID_ENDS_BIDDING` | true | A bid of 13 ends bidding immediately |
| `REVEAL_TRICK_USES_PILE` | true | The trick in which the reveal happens goes to the pile |
| `STREAK_TO_COLLECT` | 2 | Consecutive wins by one player needed to collect |
| `RESET_STREAK_AFTER_COLLECTION` | true | After collecting, the streak starts again |
| `LEFTOVER_PILE_OWNER` | `'lastTrickWinner'` | Who gets the pile after trick 13 |
| `AUTO_REVEAL_FOR_BIDDER` | true | Reveal automatically when only the hidden card is left |
| `PARTNER_MAY_REVEAL` | true | The bidder's partner may reveal when unable to follow suit |

The engine and the tests read these constants, so changing one changes the behaviour everywhere.

---

## 9. File-by-file reference

### `src/app/` — screens (Expo Router: each file is a route)

| File | Purpose | Main parts |
|---|---|---|
| `_layout.tsx` | Root layout and the provider tree: GestureHandlerRootView → SafeAreaProvider → ThemeProvider → **ErrorBoundary** → SettingsProvider → ToastProvider → GameProvider → Stack. | `RootLayout`; `StartupSync` (uploads queued games on start); `resetKey` remounts everything after a crash |
| `index.tsx` | **Home**: Lottie ambience, RANG logo, Continue / New Game / History / Settings, local stats. | `HomeScreen`, `Stat` |
| `game.tsx` | **Game Table**: TopBar, InfoStrip, Table, ActionBar, Hand, and the overlays (Bidding, Rang picker, Result, Pause, Last-trick sheet). | `useHandController` (sort, `isPlayable`, select / play / illegal hint); `dropZone` animated ref shared by Table and Hand; `useFocusEffect` sets the game active and handles Android back → pause |
| `settings.tsx` | **Settings**: name, bot difficulty, bot speed, haptics, **Reduce animations**, **hand sort order**, reset local stats (with confirm). | `saveName`, `SwitchRow` |
| `history/index.tsx` | **History** list with summary stats and loading/empty/error/not-configured states, pull-to-refresh. | `load()`, `GameRow`, `Stat` |
| `history/[id].tsx` | **History Detail**: hand summary and trick-by-trick log. | `trickResult()`, `load()` |

### `src/game/` — the pure engine (no React)

| File | Purpose | Main functions |
|---|---|---|
| `types.ts` | All shared types: `Card`, `Seat`, `Team`, `Phase`, `GameState`, `GameAction`, `TrickRecord`, `PublicView`… | — |
| `deck.ts` | The deck, the seeded RNG, the shuffle, card labels and sorting. | `createDeck`, `mulberry32`, `shuffle` (Fisher–Yates), `sortHand`, `cardName`, `cardFromId` |
| `rules.ts` | Small rule helpers. | `nextSeat`, `teamOf`, `partnerOf`, `legalCards`, `canFollowSuit`, `beats`, `trickWinner`, `bidError`, `revealError`, `lockedWinner` |
| `rulesConfig.ts` | Every unspecified rule decision as a constant (section 8). | `RULES` |
| `engine.ts` | The state machine and validated reducer. | `createMatch`, `applyAction`, `gameReducer`, `getLegalCards`, `getPublicView`, `computeVoids`; internal: `startHand`, `recordCall`, `finishBidding`, `chooseRang`, `doReveal`, `applyAutoReveal`, `playCard`, `resolveTrick`, `finishHand` |
| `ai.ts` | Bots (easy / normal). | `decideBotAction`, `evaluateHand` (bidding), `chooseRangCard`, `normalPlay` (follow cheaply, protect partner, keep the Rang hidden, defenders force a reveal, master-card and trump tracking) |
| `players.ts` | Seat profiles: names, emoji avatars, colours. | `getPlayers`, `HUMAN_SEAT` |
| `__tests__/*.test.ts` | Jest tests: deck, bidding, play/reveal, pile, hand (auto-reveal, win/lose, illegal actions, restart, no-cheating, 150 random hands), ai (90 bot-only hands + heuristics). | `helpers.ts`: `playingFixture`, `run`, `playTrick`, `playRandomHand` |

### `src/context/`

| File | Purpose |
|---|---|
| `GameProvider.tsx` | `useReducer(rootReducer)` over the engine; validated human actions (`act`); the bot and deal scheduler; the trick hold/sweep display; reveal and collect events (haptics + toasts); app-background pause; saving at hand end. Exposes `useGame()`. |
| `SettingsProvider.tsx` | Settings (incl. `reduceMotion`, `handSort`) and local stats in AsyncStorage. Exposes `useSettings()`, `useOptionalSettings()` (null outside the provider) and `BOT_DELAY`. |

### `src/components/`

| File | Purpose |
|---|---|
| `PlayingCard.tsx` | A card drawn with Views, Text and SVG (ivory face, corner indices, court monogram, navy and brass back). `CardBack` is reused by the deal animation and the pile. |
| `SuitIcon.tsx` | ♠ ♥ ♦ ♣ as SVG paths; `suitColorOnDark`. |
| `Hand.tsx` | The human's fanned hand. Layout from `fanLayout` (all 13 cards always fit, corners readable). Each card's `state` (playable / blocked / idle) drives a glow border + halo + lift, a dark dim + lower, or neutral — all Reanimated shared values. Tap-to-select, drag-to-drop-zone (UI-thread `measure()` hit test), flick, per-card shake on an illegal tap, deal-in, re-sort slide. |
| `DropZone.tsx` | The dashed, glowing target in the centre of the table that appears while you drag a card (reads the shared `dragState`; its `animatedRef` is what the card measures). |
| `PressableScale.tsx` | The shared micro-interaction: press-scale spring + light haptic. Used by AppButton, icon buttons, bid chips, segmented options, history rows, the Rang picker. |
| `Table.tsx` | The felt table: gradient + SVG dot texture + spotlight + vignette + a gold ring around the trick area. Seat panels, DropZone, TrickArea, RangSlot, MiddlePile + streak chip, Lottie sparkle where a trick is collected, DealOverlay — positioned from `onLayout`. |
| `Seat.tsx` | Seat panel: avatar with team ring, name, mini card-back stack + count, dealer chip, bidder crown, bid bubble, animated accent ring + glowing panel on their turn, "thinking…" dots for bots. |
| `Avatar.tsx` | Emoji medallion with a team-coloured ring. |
| `TrickArea.tsx` | Fly-in cards, the winning card pops up with a "Winner" tag, then the trick sweeps to the winner's side or the pile. |
| `MiddlePile.tsx` | Stacked backs with a count badge and the Lottie sparkle on collection. |
| `RangSlot.tsx` | Face-down Rang with a lock "Rang hidden" caption; 3-D flip on reveal, Lottie burst, suit medallion and "Rang · Diamonds" caption. |
| `DealOverlay.tsx` | Card backs flying from the dealer to each seat. |
| `ScoreBoard.tsx` | `TopBar` (pause, hand number, "Us / Them" score chips, "Last" trick button) and `InfoStrip` (bid + bidder chip, `RangBadge` that flips lock → suit, `TeamProgress` bars "Bidders 5 / 8", "Defenders 2 / 6", "result decided"). `IconButton` is exported for reuse. |
| `ActionBar.tsx` | The status bar: mini seat, status text with a tone icon, red error/hint with shake, pulsing Reveal Rang button + one-line hint, Sort toggle (suit ↔ rank). |
| `BiddingPanel.tsx` | Bidding sheet: 5 cards in a small fan, live calls (each new call pops in), large bid chips 8–13 (locked when too low), Pass. |
| `RangPicker.tsx` | The human bidder chooses the face-down card. |
| `ResultModal.tsx` | Big win or lose Lottie, trick totals that count up (`CountUp`), hand summary, match score, cloud-save line, Next Hand / Restart Match / Home. |
| `PauseMenu.tsx` | Resume / Restart Hand / Restart Match / Quit, each with a confirmation. |
| `ConfirmDialog.tsx` | Reusable "Are you sure?" dialog. |
| `LastTrickModal.tsx` | Bottom sheet with the last trick (leader ▶, winner glow, where it went); `describeOutcome()`. |
| `Overlay.tsx` | Dimmed layer and animated panel used by all dialogs. With `scrim={false}`, touches pass through to the table. |
| `FadeInView.tsx` | Mount animation (fade / slide / zoom) using a shared value; appears instantly with reduced motion. |
| `LottieAnim.tsx` | Crash-proof Lottie player. |
| `ErrorBoundary.tsx` | Catches render errors and shows "Something went wrong — Restart" (or a silent fallback). |
| `Toast.tsx` | `ToastProvider` / `useToast()` for non-blocking messages. |
| `AppButton.tsx` | Gold / glass / ghost / danger button built on `PressableScale` (spring press + haptic). |
| `GlassPanel.tsx`, `Segmented.tsx`, `ScreenHeader.tsx` | Panel surface, segmented control, back-button header. |

### `src/services/`

| File | Purpose |
|---|---|
| `storage.ts` | Crash-proof AsyncStorage helpers (`readJSON`, `readArray`, `writeJSON`), `getDeviceId`, the `LocalStats` type. |
| `firebase.ts` | Reads `EXPO_PUBLIC_FIREBASE_*`; `isFirebaseConfigured`; `getDb()` (lazy Firestore with long polling). |
| `historyService.ts` | `buildRecord`, `saveHandResult`, `flushQueue`, `fetchHistory`, `fetchGame`, `summarize`. |

### `src/theme/`, `src/hooks/`, `src/utils/`

| File | Purpose |
|---|---|
| `theme/theme.ts` | Design tokens: colours, gradients, spacing, radii, typography, shadows, motion timings. |
| `theme/animations.ts` | The Lottie registry (the only `require()` of the JSON files). |
| `hooks/useLayout.ts` | Responsive card, seat and content sizes from `useWindowDimensions`. |
| `hooks/useFeedback.ts` | Haptics (tap / press / play / error / success / warning) that respect the Settings toggle; works outside the provider too. |
| `hooks/useMotion.ts` | `{ reduced, ms() }`: true when the "Reduce animations" setting OR the phone's own setting is on. |
| `hooks/useHandController.ts` | Everything a Game screen needs for `<Hand>`: sorted cards with `isPlayable`, selection, play, illegal-tap hint, the shared `dragState`, sort toggle. Stable callbacks via a latest-value ref. |
| `utils/handView.ts` | Pure helpers: `sortForDisplay`, `buildHandView` (→ `isPlayable` + state), `illegalMessage`, `cardA11yLabel`, `fanLayout` (fit-to-width arc). Unit-tested. |
| `utils/format.ts` | Team labels, dates, durations. |
| `utils/status.ts` | `statusInfo` → `{ text, tone }` (whose turn, trick winner; the tone picks the status icon), `statusLine`, `streakLine` and the short `streakChip` for the pile. |

---

## 10. Stability checklist

- **Illegal actions** return `{ ok: false }` and leave the state untouched (tested). The UI shows a message,
  never a crash.
- **Bots** run through a safety net: if a bot ever proposed an illegal move, `fallbackAction` plays a legal one.
- **Timers** are created in effects and cleared in their cleanup (state change, pause, unmount, blur).
- **Backgrounding** the app pauses the game; leaving the Game screen stops the bots.
- **Rapid taps** are guarded: an input lock lasts until the next render, and actions are ignored while a
  finished trick is on display.
- **Crashes**: a global ErrorBoundary covers the app, and a local one wraps each Lottie animation.
- **Offline**: Firebase writes have timeouts and fall back to the local queue; History shows local games.

## 11. React patterns worth explaining (lint-clean with `npx expo lint`)

- **Per-hand state is keyed, not reset.** GameProvider stores values such as `{ key: handKey, count }` (the
  acknowledged tricks), the sweep stage and the save status. When a new hand starts, the key no longer
  matches, so the value reads as its default. No effect has to "reset" it, which avoids extra renders.
- **Derived instead of synced.** These are computed during render rather than copied into state by an effect:
  - the illegal-move message (tied to the exact `GameState` it describes, so it disappears when the game moves on);
  - the trick on display;
  - the selected card in `game.tsx` (keyed to the hand);
  - whether the sparkle or burst Lottie should play.
- **Latest-value refs** (`gameRef`, `pausedRef`, …) are updated in `useLayoutEffect`, never during render.
  Timers and tap handlers read them to get the current state without re-subscribing.
- **Reanimated shared values** are written with `.set(...)` from JavaScript (effects and handlers) and read
  with `.value` inside worklets (`useAnimatedStyle`, gesture callbacks).

---

## 12. Online multiplayer (host-authoritative rooms)

### The idea

The engine (`src/game/*`) is reused **unchanged**. One phone, the **host** (who created the room), runs it
and is the only writer of the game state. Every other phone sends *requests* and renders what the host
publishes. Bots for empty or abandoned seats also run on the host, using the same `ai.ts`.

```
 Player's phone                         Firestore                          Host's phone
 tap a card
  → useOnline().move()
     (checked locally with the engine
      on my view → instant feedback)
  → addDoc rooms/{code}/actions ─────▶ action {status:'pending',
                                          version, uid, type, cardId}
                                                          ─────────────▶ listenPendingActions
                                                                         HostController.handleAction:
                                                                          1 seated? 2 stale? 3 engine.applyAction
                                                                         version++ → ONE batch write:
                                        rooms/{code}             ◀──────  publicState (no secrets)
                                        rooms/{code}/hands/{uid} ◀──────  each human's own cards
                                        actions/{id}.status      ◀──────  'applied' | 'rejected' + reason
 onSnapshot(room) + onSnapshot(my hand) ◀──
  → netReducer shows them only as a matching-version pair
  → toLocalView (rotate: I am South, my team is "A")
  → the existing Table / Hand / ActionBar re-render and animate
```

### Firestore documents (`src/online/types.ts`)

| Document | Written by | Read by | Contents |
|---|---|---|---|
| `rooms/{code}` | host only | signed-in users | `hostUid`, `status` (lobby / playing / handOver / closed), `seats[4]` (uid, name, isBot, team, replacedUid), `publicState`, `notice`, `closedReason` |
| `rooms/{code}/players/{uid}` | that player | signed-in users | name, `wantsSeat`, `heartbeat` counter, timestamps |
| `rooms/{code}/hands/{uid}` | host | **only that player** | the player's cards (+ the face-down Rang card for the bidder) |
| `rooms/{code}/actions/{id}` | the requesting player (create); host (status) | signed-in users | `uid`, `type`, `value`/`cardId`, `version`, `status`, `reason` |

**What is never public.** `protocol.toPublicState` never publishes:
- anyone's hand or the undealt stock;
- the shuffle seed (`handId` is a separate random number);
- the hidden Rang, until it is revealed (`rangPlaced: true` tells clients a face-down card exists).

The tests check every single write of whole games for leaks.

### Validation and safety

- **Seat check:** the sender's uid must own a seat. Bots and replaced players can't act.
- **Stale check:** each request carries the `version` the player was looking at. If it is older than the
  version at which the current turn began, it is rejected ("based on an old view of the table").
- **Engine check:** `applyAction` decides legality (turn, follow suit, who may reveal…). Its error text is
  sent back as the rejection reason and shown as a toast and inline message.
- **Double taps:** the client locks input until a new version arrives, and the host would reject a repeat
  anyway (it's no longer that player's turn).
- **Seat races:** players *request* seats in their player document, and the host grants them in order
  (`assignSeatRequests`). If two players tap the same seat, only the first gets it.

### Presence and disconnects

- Every phone bumps a `heartbeat` counter every 10 s. Others watch for *changes* using their own clock, so
  clocks that differ between phones don't matter.
- **During a game:** a non-host player silent for 30 s (or whose player document disappeared) is replaced
  by a bot. Everyone gets a toast through `room.notice`. At the next hand the host gives the seat back if
  that player has reconnected (`restoreReturning`). While replaced, the player can still watch.
- **In the lobby:** a silent or departed player's seat is simply freed.
- **Host:** if the host leaves, the room is marked `closed` ("Host left the room"). If the host's heartbeat
  stops for 40 s, every client closes the room itself. Either way, players return to Home.
- **Background / resume:** returning to the app re-attaches every listener and sends a heartbeat (`resubscribe`).
- **Offline:** NetInfo shows an offline banner, the online buttons are disabled with a reason, and
  single-player is unaffected.
- **Cleanup:** leaving the room, or the online section (whose layout owns the provider), unsubscribes every
  listener and clears every timer.

### History for online hands

When a hand ends, **each human's device** saves its own record to `games` (`useOnlineHistory`), from its
own point of view (seat 0 = me). The record adds `mode: "online"`, `roomCode` and `botSeats`;
`playerNames` lists all four names. History shows an **Online** badge, and History Detail lists the
players, with bots marked.

### Security rules (`firestore.rules`)

- **`games`:** unchanged; works without sign-in.
- **Rooms:** require Anonymous Auth.
  - Only the room's `hostUid` may update the room or write hands.
  - Each player may write only their own player document.
  - Players may create actions only with their own uid and status `pending`.
  - The host may change only `status` and `reason` on an action.
  - A hand document is readable only by its owner.
- **Known limitation:** without Cloud Functions there is no trusted server, so the host's phone holds the
  full state in memory. A modified host app could cheat. The rules still stop every *other* player from
  seeing hidden cards.

### New files

| File | Purpose |
|---|---|
| `src/services/auth.ts` | Anonymous sign-in. React Native persistence with AsyncStorage (in-memory on web, so each browser tab is a different player). `ensureSignedIn`, `authErrorMessage`. |
| `src/types/firebase-auth-rn.d.ts` | Declares `getReactNativePersistence` (exported by Firebase's React Native build but missing from its default typings). |
| `src/online/types.ts` | `RoomDoc`, `RoomSeat`, `PublicState`, `PlayerDoc`, `HandDoc`, `ActionDoc`. |
| `src/online/roomCode.ts` | `generateRoomCode` (no 0/O/1/I/L), `normalizeRoomCode`, `roomCodeError`. |
| `src/online/protocol.ts` | `toPublicState`, `handDocFor`, `toGameAction`, the seat helpers (`assignSeatRequests`, `replaceWithBot`, `restoreReturning`, `staleSeats`), and `toLocalView` (rotation + team swap). |
| `src/online/HostController.ts` | The authoritative loop: `startGame`, `handleAction`, `hostMove`, `finishDeal`, `botToAct`/`playBot`, `nextHand`, `restartMatch`, `replaceDisconnected`, `close`. Writes through a `HostStore` (Firestore, or a fake in tests) in ordered batches. |
| `src/online/roomService.ts` | Firestore I/O: `createRoom` (transaction, unique code), `joinRoom` (clear errors), `requestSeat`, `heartbeat`, `leaveRoom`, `sendAction`, the listeners, and `firestoreHostStore`. |
| `src/online/OnlineRoomProvider.tsx` | Context for the online screens: sign-in, create/join/leave, listeners merged by `netReducer`, heartbeat and presence, host timers (deal, bots, disconnects), local move validation, `useOnline()`. |
| `src/online/useTableDisplay.ts` | Trick hold/sweep and the reveal/collect events for network states (mirrors GameProvider so single-player stays untouched). |
| `src/online/useOnlineHistory.ts` | Saves each online hand to `games` from this player's view. |
| `src/app/online/_layout.tsx` | The online section's Stack; owns the `OnlineRoomProvider`. |
| `src/app/online/menu.tsx` | Create Room / Join Room (code validation, offline and not-configured states, Lottie busy overlay). |
| `src/app/online/lobby.tsx` | Room code + Copy/Share, mini table of seats (team colours, host crown, connection dots), tap to sit, host bot controls, Start Game, Leave. |
| `src/app/online/game.tsx` | The online table: same components as single-player, "Waiting for <name>…", room code + connection dot, host-only Next Hand, a leave confirmation, the spectator banner. |
| `src/components/OfflineBanner.tsx`, `ConnectionDot.tsx` | Offline strip; green / amber / red connection indicator. |
| `src/hooks/useIsOnline.ts` | NetInfo connectivity. |
| `src/online/__tests__/online.test.ts` | 19 tests with a fake Firestore store (listed in `docs/RUBRIC_CHECKLIST.md`). |
| `firestore.rules`, `firebase.json`, `.firebaserc` | Security rules + Firebase CLI config. |

**Changed files:** small, **additive** changes only. The single-player provider and the engine are untouched.
- Home (`index.tsx`) has the Play vs Bots / Play Online buttons.
- `_layout.tsx` has the `online` route.
- `TopBar` has optional `leftIcon`/`subtitle` props.
- `ResultModal` has optional `canContinue`/`homeLabel` props.
- `historyService` has an optional `online` argument.
- The History screens show the badge and the player list.
- `firebase.ts` has `getFirebaseApp`.

---

## 13. UI/UX: playable-card highlighting and the interactive table

This pass changed **only the UI** — no file in `src/game/` was touched and every engine test still passes.
The same components are used offline and online (`useHandController` is shared), so both modes behave
identically.

### How the highlighting works (engine → `isPlayable` → style)

```
engine.getLegalCards(state, seat)      rules.legalCards: must follow the led suit if you can,
        │                              otherwise (or when leading) every card is legal
        ▼
legalIds: Set<string>                  GameProvider (offline) / OnlineRoomProvider (online)
        │
        ▼
buildHandView(sorted, legalIds, myTurnToPlay)        utils/handView.ts — pure, unit-tested
        │   → [{ card, isPlayable, state }]  state = 'playable' | 'blocked' | 'idle'
        ▼
<Hand> → <HandCard state=…>             each state sets Reanimated targets:
          playable → glow 1 (accent border + halo, pulsing), lift −7 %
          blocked  → dim 1 (dark overlay ≈ 45 % brightness), lower +5 %, pan gesture disabled
          idle     → all 0; the whole hand ignores touches (not your turn)
```

- **The UI never decides legality.** It only reads `legalIds` from the engine. If the rules change in
  `rules.ts`, the highlighting follows automatically.
- `myTurnToPlay` is true only in the PLAYING phase, on your turn, while no finished trick is on display and
  the game isn't paused (online: also no move in flight). When you lead, every card is legal, so every card
  glows.
- "Dimmed" is a dark overlay rather than 45 % opacity, so overlapping cards never show through each other.
- **Tapping a blocked card** runs on the UI thread: the card shakes, then `scheduleOnRN(onBlocked)` shows
  "You must follow ♦ Diamonds" (`illegalMessage`) with an error haptic. Nothing is sent to the engine.
- Screen readers hear "Eight of Diamonds, playable" / "…, not playable — must follow suit"
  (`cardA11yLabel`).

### The hand fan always fits (`fanLayout`)

Given the card count and the available width, it picks the largest card width for which:
(1) the **rotated** outer cards still fit on screen, and (2) every card shows at least 34 % of its width,
so its rank + suit corner is readable. On a narrow phone with 13 cards the cards shrink instead of being cut
off. Jest checks every count from 1 to 13 on widths from 300 to 744 px.

### Drag to play

`dragState` is a shared value (0 idle · 1 dragging · 2 over the zone) created in `useHandController` and
given to both `<Hand>` and `<Table>`. While a card is dragged, its pan worklet calls Reanimated's
`measure(dropZoneRef)` **on the UI thread** and compares the finger position with the zone's rectangle. The
`DropZone` reads `dragState` to fade in and brighten. No React state changes during the drag, so it stays at
60 fps. On release over the zone (or after a firm upward flick) the card fades and `onPlay` runs; otherwise it
springs back.

### Table, HUD and status

- **Seat panels**: avatar with team ring, mini card-back stack + count, crown, dealer chip; on their turn an
  accent ring breathes and the panel glows; bots show bouncing "thinking…" dots.
- **Trick**: cards fly in from the player's side; the winner pops up with a "Winner" tag; the trick sweeps
  to the winner's side (or the middle pile) and a Lottie sparkle plays where it was collected.
- **Rang**: the table slot shows a lock "Rang hidden" caption, flips in 3-D with a Lottie burst on reveal;
  the HUD `RangBadge` flips from the lock to the suit.
- **Middle pile** shows a streak chip ("Sana won last · 1 more → 3 tricks").
- **HUD**: hand number, Us / Them chips, "Last" trick bottom sheet, bid chip, and a progress bar per team
  towards what it needs (bidders → the bid, defenders → 14 − bid).
- **Status bar**: `statusInfo` returns a text and a tone; the tone picks the icon (✋ your turn, ⏳ waiting,
  🏆 trick won…). Reveal Rang pulses (with a short tip) when you can't follow suit.

### Motion, accessibility and performance

- **Reduce animations** (Settings) or the phone's "Remove animations" → `useMotion().reduced`: durations
  become 0, pulses / sparkles / the deal animation are skipped, screens switch without a transition.
- Every button uses `PressableScale` (press-scale + haptic) and has an `accessibilityLabel`.
- **Performance**: cards are `memo` components; `useHandController` gives them **stable callbacks** (a
  latest-value ref), so selecting a card re-renders only the cards whose props changed. One shared `pulse`
  value drives every glow. The felt decoration is a memoised SVG that only redraws when the table resizes.
- **Android detail**: the card's `elevation` would draw it above its own overlays, so each card is wrapped
  in a plain `View` — the glow border and the dim layer then sit on top correctly.

### New / changed files in this pass

| File | What changed |
|---|---|
| `components/Hand.tsx` | Rewritten: fanLayout, playable/blocked/idle states, glow + dim, drag-to-drop-zone, per-card shake. |
| `components/DropZone.tsx`, `components/PressableScale.tsx` | New. |
| `components/Table.tsx`, `Seat.tsx`, `TrickArea.tsx`, `RangSlot.tsx`, `MiddlePile.tsx` | Felt texture + vignette, seat panels, thinking dots, winner tag, collection sparkle, lock caption, streak chip. |
| `components/ScoreBoard.tsx`, `ActionBar.tsx` | Score chips, Last button, RangBadge flip, team progress bars; status icons, pulsing Reveal + hint, Sort toggle. |
| `components/BiddingPanel.tsx`, `ResultModal.tsx`, `LastTrickModal.tsx`, `RangPicker.tsx` | Bid chips, pop-in calls, count-up totals, bottom sheet, press feedback. |
| `components/AppButton.tsx`, `FadeInView.tsx`, `Segmented.tsx`, `ScreenHeader.tsx` | Press-scale + haptic everywhere; reduced motion. |
| `hooks/useHandController.ts`, `hooks/useMotion.ts`, `utils/handView.ts` | New. |
| `utils/status.ts`, `hooks/useFeedback.ts`, `context/SettingsProvider.tsx`, `theme/theme.ts` | `statusInfo` tones + `streakChip`; `press` haptic; `reduceMotion` + `handSort`; accent / dim / motion tokens. |
| `app/game.tsx`, `app/online/game.tsx`, `app/settings.tsx`, `app/_layout.tsx`, `app/history/index.tsx` | Wired to the above; Settings switches; motion-aware navigator. |
| `utils/__tests__/handView.test.ts`, `utils/__tests__/status.test.ts` | New tests (sorting, isPlayable, fan fit, messages, the full engine → isPlayable pipeline). |

Screenshots: `docs/screenshots/before/` and `docs/screenshots/after/`.

The five highlighting cases (leading, following, void in the led suit, bidder reveal, not my turn) are
tested end to end — engine `getLegalCards` + `revealError` → `buildHandView` — in
`utils/__tests__/playableCards.test.ts`.

---

## 14. Emoji reactions (no text chat)

Assignment constraint: **no chat, no text input, no voice, no message history** — only 10 fixed emojis
(`REACTION_EMOJIS` in `utils/reactions.ts`: 😀 😂 😮 😢 😡 👍 🎉 🔥 👑 🤔).

```
😀 button on the felt (ReactionButton) → tray of 10 → pick one
   → useReactions.show(seat, emoji)   rate limit 1 / 2 s per seat; dropped if Settings → Reactions is off
   → bubbles[] → Table → ReactionLayer → <Float> (Reanimated: pop, drift up, fade, ~2.5 s) above the seat
```

- **Single-player** (`app/game.tsx`): my reaction → `show(0, emoji)` + tap haptic. `useBotReactions`
  compares the previous and new `GameState` and calls `botReactions` (pure, tested): a bot may react when it
  wins a trick (20 %), when the Rang is revealed (45 %), and at the end of the hand (50 % each, max 2).
- **Online** (`online/useOnlineReactions.ts`): `send` shows mine at once, then `roomService.sendReaction`
  adds `{ uid, seat, emoji, t, at }` to `rooms/{code}/reactions`. `listenReactions` skips the first
  snapshot (old reactions from before joining) and passes on only newly **added** docs; my own echo is
  skipped, and the real seat → view seat (`view.viewSeat`) so it floats above the sender on every phone.
  Only the host runs `useBotReactions` and writes the bots' reactions for their seats. The listener is an
  effect keyed on the room code, so leaving the room / screen unsubscribes it.
- **Settings → Reactions** (default on): off hides the button and incoming reactions are not shown.
- **Rules**: a signed-in user may only create a reaction with their own `uid`, for the seat they occupy
  in that room (the host also for a bot seat), with one of the 10 emojis and only the allowed fields;
  reactions can never be updated or deleted.

| File | Purpose |
|---|---|
| `utils/reactions.ts` (+ test) | Emoji list, rate limiter, `botReactions`. |
| `hooks/useReactions.ts` | Bubble state + timers, `useBotReactions`. |
| `components/Reactions.tsx` | `ReactionButton` (tray), `ReactionLayer` / `Float`. |
| `online/useOnlineReactions.ts`, `roomService.sendReaction` / `listenReactions`, `types.ReactionDoc` | Online path. |
| `Table.tsx`, `app/game.tsx`, `app/online/game.tsx`, `SettingsProvider`, `app/settings.tsx` | Wiring + toggle. |

---

## 15. Deploying Firestore rules (Firebase CLI)

`firebase.json` points at `firestore.rules`; `.firebaserc` selects the project
(`EXPO_PUBLIC_FIREBASE_PROJECT_ID`). After any change to the rules:

```bash
firebase deploy --only firestore:rules
```

The CLI compiles the rules first and refuses to upload if they have an error. Only rules are ever
deployed from this repo (no Hosting / Functions), and nothing deletes data.

---

## 16. Sound effects (`expo-audio`, works in Expo Go)

**Files:** 13 short WAVs (< 1 s, ~250 KB total) in `assets/sounds/`, synthesised by
`node scripts/generate-sounds.js` (sine chimes/bells + filtered-noise card flicks, smooth fades, quiet
peak levels). They are referenced from one file only: `src/theme/sounds.ts` (`SOUND_FILES`, volumes,
voices per sound, anti-spam gaps). Rollback point before sounds: git tag `v1.0-before-sounds`.

**Service:** `src/services/soundService.ts` — `init()` sets the audio mode (`playsInSilentMode: false` so
the iOS silent switch mutes it; mixes with other apps) and preloads a player per sound (2 for tap / select
/ play / pop so quick repeats overlap). `play(name)` rewinds a free player and plays; the same sound is
throttled (`SOUND_MIN_GAP`) so fast bot turns don't spam. Every call is wrapped in try/catch — a broken
sound never crashes the app (warning in dev only). `release()` removes all players. The backend is
injected, so `services/__tests__/soundService.test.ts` uses a fake. On Android the sounds follow the
media volume.

**Hooks:** `hooks/useSound.ts` — `useSoundSetup()` (root layout: preload, sync with Settings, release on
unmount), `useSound()` → `sfx(name)`, `useGameSounds(game, mySeat)` → `utils/gameSounds.gameSoundsFor`
(pure, tested) diffs the previous and next state: one event sound (win/lose > reveal > pile collected >
trick won > bid > your turn > deal) plus a card flick when another player put a card down.

| Sound | Where it plays |
|---|---|
| tap | every `PressableScale` press (so every `AppButton`, icon button, chip) |
| select / play / invalid | `useHandController`: select, play (tap or drag), illegal tap (with shake + haptic) |
| trick, pile, reveal, bid, turn (mine only), deal, win / lose, other players' cards | `useGameSounds` in `app/game.tsx` and `app/online/game.tsx` |
| pop | sending a reaction (single-player and online) |

Online: each phone plays sounds for the states it sees — nothing goes through Firestore.

**Settings:** "Sound effects" switch (default on) + Volume Low / Medium / High, saved with the other
settings in AsyncStorage; independent of the "Haptics" switch.

