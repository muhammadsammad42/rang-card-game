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

- **The engine is pure TypeScript.** It is easy to test (299 Jest tests) and easy to explain, and it can't
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

1. **Gesture.** In `Hand.tsx`, each card has a Gesture Handler tap and pan gesture. These callbacks are
   *worklets* (they run on the UI thread). They call `scheduleOnRN(onTap, card)` to get back to JavaScript.
2. **Screen logic.** `game.tsx → onTap`:
   - The first tap selects the card, which lifts with a Reanimated spring.
   - A second tap (or a swipe up) calls `GameProvider.playCard(cardId)`.
   - If it's your turn and the card is illegal, the tap immediately explains why.
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
- **Reading.** `fetchHistory()` queries `where('deviceId', '==', id)`. This is a single-field filter, so no
  composite index is needed. Results are sorted newest-first on the device and merged with games still in
  the queue (marked "not synced").
- **History screen states:** loading (Lottie), empty, error with Retry, not configured, and pull-to-refresh.
  It also shows summary stats (games played, win %, average bid, times as bidder). Tapping a row opens
  `history/[id].tsx` with the full trick-by-trick log.

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
| `game.tsx` | **Game Table**: TopBar, InfoStrip, Table, ActionBar, Hand, and the overlays (Bidding, Rang picker, Result, Pause, Last-trick). | `onTap`/`onSwipe` (select / play); `useFocusEffect` sets the game active and handles Android back → pause |
| `settings.tsx` | **Settings**: name, bot difficulty, bot speed, haptics, reset local stats (with confirm). | `saveName` |
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
| `SettingsProvider.tsx` | Settings and local stats in AsyncStorage. Exposes `useSettings()` and `BOT_DELAY`. |

### `src/components/`

| File | Purpose |
|---|---|
| `PlayingCard.tsx` | A card drawn with Views, Text and SVG (ivory face, corner indices, court monogram, navy and brass back). `CardBack` is reused by the deal animation and the pile. |
| `SuitIcon.tsx` | ♠ ♥ ♦ ♣ as SVG paths; `suitColorOnDark`. |
| `Hand.tsx` | The human's fanned hand: arc layout, deal-in, re-sort slide, selection lift, swipe-up and tap gestures (worklets + `scheduleOnRN`), shake on error. |
| `Table.tsx` | The felt table (SVG radial spotlight), West/North/East seats, TrickArea, RangSlot, MiddlePile, DealOverlay, positioned from `onLayout`. |
| `Seat.tsx` | Avatar, name, team dot, card count, dealer chip, bidder crown, bid bubble, pulsing turn halo. |
| `Avatar.tsx` | Emoji medallion with a team-coloured ring. |
| `TrickArea.tsx` | Fly-in cards, winner glow, sweep to the winner or the pile. |
| `MiddlePile.tsx` | Stacked backs with a count badge and the Lottie sparkle on collection. |
| `RangSlot.tsx` | Face-down Rang, 3-D flip on reveal, burst, suit medallion. |
| `DealOverlay.tsx` | Card backs flying from the dealer to each seat. |
| `ScoreBoard.tsx` | `TopBar` (pause, hand number, match score, last-trick peek) and `InfoStrip` (bid/crown, Rang status, tricks vs. needed, "result decided"). |
| `ActionBar.tsx` | The human's mini seat, status line, streak line, inline error with shake, Reveal Rang button. |
| `BiddingPanel.tsx` | Bidding sheet: 5 cards, live calls, bid buttons 8–13, Pass. |
| `RangPicker.tsx` | The human bidder chooses the face-down card. |
| `ResultModal.tsx` | Win or lose Lottie, hand summary, match score, cloud-save line, Next Hand / Restart Match / Home. |
| `PauseMenu.tsx` | Resume / Restart Hand / Restart Match / Quit, each with a confirmation. |
| `ConfirmDialog.tsx` | Reusable "Are you sure?" dialog. |
| `LastTrickModal.tsx` | Peek at the last trick; `describeOutcome()`. |
| `Overlay.tsx` | Dimmed layer and animated panel used by all dialogs. With `scrim={false}`, touches pass through to the table. |
| `FadeInView.tsx` | Mount animation (fade / slide / zoom) using a shared value. |
| `LottieAnim.tsx` | Crash-proof Lottie player. |
| `ErrorBoundary.tsx` | Catches render errors and shows "Something went wrong — Restart" (or a silent fallback). |
| `Toast.tsx` | `ToastProvider` / `useToast()` for non-blocking messages. |
| `AppButton.tsx` | Gold / glass / ghost / danger button with a spring press. |
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
| `hooks/useFeedback.ts` | Haptics (tap / play / error / success / warning) that respect the Settings toggle. |
| `utils/format.ts` | Team labels, dates, durations. |
| `utils/status.ts` | `statusLine` (whose turn, trick winner) and `streakLine` (middle-pile streak text). |

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
