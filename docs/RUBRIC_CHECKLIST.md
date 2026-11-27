# Rubric checklist

Each rubric criterion mapped to the features and files that satisfy it.

## 1. Game rules & logic — 25

| Requirement | Where | Evidence |
|---|---|---|
| 4 players, 2 teams, partners opposite, 52 cards, A high | `src/game/rules.ts` (`teamOf`, `partnerOf`), `src/game/deck.ts` | `deck.test.ts` |
| Fisher–Yates shuffle, 5 cards dealt from the dealer's left | `deck.ts` `shuffle`, `engine.ts` `startHand` | `deck.test.ts` |
| One bidding round, 8–13, must outbid, 13 ends bidding, all-pass → first player bids 8 | `engine.ts` `recordCall`, `finishBidding`; `rules.ts` `bidError` | `bidding.test.ts` |
| Bidder hides one card; its suit is the Rang; then 8 more cards each (bidder 12 + 1) | `engine.ts` `chooseRang` | `deck.test.ts` "everyone has 13" |
| The Rang is secret (UI and bots) | `engine.getPublicView`, `ScoreBoard.tsx`, `RangSlot.tsx` | `hand.test.ts` "public view", `ai.test.ts` |
| Bidder leads trick 1; follow suit enforced | `engine.ts` `FINISH_DEAL`, `playCard`; `rules.legalCards` | `play.test.ts` "follow suit" |
| Before the reveal: highest led-suit card wins; off-suit never wins | `rules.beats`, `trickWinner` | `play.test.ts` |
| Reveal: bidder any time on their turn; others only when void | `rules.revealError`, `engine.doReveal` | `play.test.ts` "who may reveal" |
| After the reveal: trump beats non-trump, highest trump wins; the reveal trick uses trump rules | `rules.trickWinner` | `play.test.ts` |
| Bidder auto-reveal when only the hidden card is left | `engine.applyAutoReveal` | `hand.test.ts` |
| Middle pile: collected on two consecutive wins by the same player; streak reset; leftovers to the last winner | `engine.resolveTrick` | `pile.test.ts` |
| Win if tricks ≥ bid (defenders need 14 − bid); score; dealer rotates | `engine.finishHand`, `NEXT_HAND` | `hand.test.ts` |
| "Result decided" indicator | `rules.lockedWinner`, `ScoreBoard.tsx` InfoStrip | — |
| Configurable unspecified rules | `src/game/rulesConfig.ts` | `docs/PROJECT_GUIDE.md` §8 |
| Robustness | 150 random full hands + 90 bot-only hands, all legal | `hand.test.ts`, `ai.test.ts` |

## 2. UI/UX — 20

| Requirement | Where |
|---|---|
| Original "Midnight Lounge" identity: tokens in one file | `src/theme/theme.ts` |
| Cards drawn in code (faces, court monograms, backs), original app icon | `PlayingCard.tsx`, `SuitIcon.tsx`, `assets/images/*` |
| Home (logo, Lottie, New Game / Continue / History / Settings, stats) | `src/app/index.tsx` |
| Felt table: gradient + SVG texture + vignette + trick ring | `Table.tsx` (`FeltDecor`) |
| Seat panels: avatar, team ring, mini card stack + count, dealer chip, bidder crown, animated turn ring, bot "thinking…" dots | `Seat.tsx` |
| Hand: all 13 cards always fully on screen (fit-to-width fan, corners readable), sort by suit / rank | `Hand.tsx`, `utils/handView.ts` (`fanLayout`, `sortForDisplay`), Sort chip in `ActionBar.tsx` |
| **Playable-card highlighting**: engine legal cards → `isPlayable` → glow + lift / dim + lower / neutral when not your turn | `utils/handView.ts` (`buildHandView`), `hooks/useHandController.ts`, `Hand.tsx` — explained in PROJECT_GUIDE §13 |
| Illegal tap: card shake + error haptic + "You must follow ♦ Diamonds" | `Hand.tsx`, `illegalMessage`, `ActionBar.tsx` |
| Tap to select (lift + grow), tap again or **drag to the glowing drop zone** to play; snaps back outside | `Hand.tsx`, `DropZone.tsx` |
| Trick: fly-in, winner pop + "Winner" tag, sweep to the winner / pile, Lottie sparkle on collection | `TrickArea.tsx`, `Table.tsx` |
| HUD: hand number, Us / Them chips, bid chip, Rang badge (lock flips to suit), team progress bars, "result decided" | `ScoreBoard.tsx` |
| Middle pile + streak chip; "Last" trick bottom sheet | `MiddlePile.tsx`, `Table.tsx`, `utils/status.ts` (`streakChip`), `LastTrickModal.tsx` |
| Status bar with icons ("Your turn: follow ♣ Clubs", "Waiting for Noor…", "Sana wins trick 4") | `utils/status.ts` (`statusInfo` tones), `ActionBar.tsx` |
| Reveal Rang only when legal; pulses with a tip when you can't follow suit | `ActionBar.tsx` (`canReveal` from `rules.revealError`) |
| Bidding panel (large chips 8–13 with locked states, card fan, calls pop in), Choose-Rang modal, result screen (big Lottie, count-up totals), pause menu with confirmations | `BiddingPanel.tsx`, `RangPicker.tsx`, `ResultModal.tsx`, `PauseMenu.tsx`, `ConfirmDialog.tsx` |
| Micro-interactions: press-scale + haptic on every button / chip / row | `PressableScale.tsx` (used by `AppButton`, `IconButton`, bid chips, `Segmented`, `ScreenHeader`, history rows) |
| "Reduce animations" option (also follows the phone setting) | `app/settings.tsx`, `hooks/useMotion.ts` |
| Before / after screenshots | `docs/screenshots/` |
| Highlighting cases tested end to end (lead / follow / void + reveal / bidder reveal / not my turn) | `utils/__tests__/playableCards.test.ts` |
| **Emoji reactions** (10 fixed emojis, no text chat): tray, float-up animation above the sender's seat, haptic, bots react sometimes, online via Firestore, 1 per 2 s, Settings toggle | `components/Reactions.tsx`, `hooks/useReactions.ts`, `utils/reactions.ts` (+ test), `online/useOnlineReactions.ts`, `firestore.rules` — PROJECT_GUIDE §14 |
| Firestore rules deployed with the Firebase CLI | `firebase.json`, `.firebaserc` — PROJECT_GUIDE §15 |
| Lottie animations (LottieFiles) | `theme/animations.ts`, `LottieAnim.tsx`, `assets/lottie/` |
| Reanimated: deal, lift, glow pulse, drag, fly-in, winner pop, sweep, flip, turn ring, thinking dots, progress bars, shake, press, fades | `DealOverlay`, `Hand`, `DropZone`, `TrickArea`, `RangSlot`, `Seat`, `ScoreBoard`, `ActionBar`, `PressableScale`, `FadeInView` |
| Haptics on select, play, button press, invalid move, reveal, collect, win | `hooks/useFeedback.ts`, `PressableScale.tsx`, `useHandController.ts`, `GameProvider.tsx` |
| Accessibility: every card labelled "Eight of Diamonds, playable" / "not playable", buttons labelled, live regions, text-style suit glyphs for contrast | `utils/handView.ts` (`cardA11yLabel`, `suitText`), all components |
| Responsive: no fixed sizes, safe areas, tablet max width | `hooks/useLayout.ts`, `Table.tsx` (onLayout) |

## 3. React Native implementation — 15

| Requirement | Where |
|---|---|
| Expo SDK 58 + TypeScript, runs in Expo Go (no prebuild) | `package.json`, `app.json`; `npx expo-doctor` → 20/20 |
| Expo Router navigation (Stack, dynamic route `history/[id]`) | `src/app/_layout.tsx`, `src/app/history/[id].tsx` |
| Native-compatible packages installed with `npx expo install` | `package.json` |
| `lottie-react-native` in package.json | `package.json` |
| Gesture Handler 3 hooks + worklets (`scheduleOnRN`): competing tap + pan, gestures enabled only on your turn | `Hand.tsx` |
| UI-thread hit testing with Reanimated `measure()` + `useAnimatedRef` (drag-to-play) | `Hand.tsx`, `DropZone.tsx`, `app/game.tsx` |
| Reanimated shared values and animated styles; one shared value drives all glows; shared `dragState` between components without React state | see the UI table above |
| Performance: memoised cards + stable callbacks (latest-value ref), memoised SVG felt, no re-renders during drags | `Hand.tsx`, `hooks/useHandController.ts`, `Table.tsx` |
| Shared hooks for offline and online play | `hooks/useHandController.ts`, `hooks/useMotion.ts` |
| SVG, LinearGradient, safe areas, AsyncStorage, Haptics | various |
| Clean structure, every file commented | `docs/PROJECT_GUIDE.md` §9 |

## 4. Game logic & state management — 15

| Requirement | Where |
|---|---|
| Pure, deterministic engine (seeded RNG), no React imports | `src/game/*` |
| Validated actions; illegal → error, state unchanged | `engine.applyAction`; `hand.test.ts` "illegal actions" |
| `useReducer` + Context | `context/GameProvider.tsx` (`rootReducer`), `context/SettingsProvider.tsx` |
| Explicit state machine | `types.ts` `Phase`; `docs/PROJECT_GUIDE.md` §2 |
| Bots only see `PublicView` (no cheating) | `engine.getPublicView`, `ai.ts` |
| Bot scheduler with cancellable timers; double-tap / stale-action guards | `GameProvider.tsx` |
| 352 offline Jest tests (incl. 19 online-layer tests with a fake Firestore and 34 UI-helper tests for highlighting, sorting and the hand fan) + 3 live Firestore tests | `src/game/__tests__/`, `src/services/__tests__/`, `src/online/__tests__/`, `src/utils/__tests__/` |

## 5. Error handling & stability — 5

| Requirement | Where |
|---|---|
| Global ErrorBoundary with "Something went wrong — Restart" | `components/ErrorBoundary.tsx`, `_layout.tsx` |
| Lottie failures never crash the app | `LottieAnim.tsx` |
| App backgrounding pauses; leaving the screen stops bots; timers cleaned up | `GameProvider.tsx` (AppState, `setActive`), `game.tsx` (`useFocusEffect`) |
| Android back → pause menu | `game.tsx` (BackHandler) |
| Firebase offline / not configured → local queue, retries, toasts | `services/historyService.ts`, `_layout.tsx` StartupSync |
| Storage errors swallowed safely | `services/storage.ts` |
| `tsc --noEmit` clean, `npx expo lint` clean (0 errors / 0 warnings), `expo-doctor` 20/20, tests green | CI-style commands in the README |

## 6. Viva & code understanding — 20

- `docs/PROJECT_GUIDE.md`:
  - architecture diagram and the state machine;
  - the tap → action → reducer → re-render → animation flow;
  - the reveal and the middle pile;
  - Firestore saving;
  - Lottie integration;
  - the rule decisions;
  - a file-by-file reference.
- Every source file starts with a purpose comment; non-obvious functions have short comments.
- The tests double as executable documentation of the rules.

## 7. Bonus — Firebase game history — 10 ✅ working

The app is connected to Firebase project `rang-card-game-4c317`, `(default)` Firestore database.

| Requirement | Where |
|---|---|
| **Verified live:** save → `games` document → History query → History Detail; an offline-queued game uploads; connects to `(default)` | `src/services/__tests__/firebase.integration.test.ts` (`RUN_FIREBASE_IT=1 npx jest firebase.integration`) |
| No composite index needed (single `deviceId ==` filter, sorted on device) | `historyService.fetchHistory` |
| Retries can't duplicate or get stuck (fixed document ids; an existing document counts as uploaded) | `historyService.upload`, `existsInCloud`, `flushQueue` |
| Firebase JS SDK + Cloud Firestore, config from `EXPO_PUBLIC_FIREBASE_*` in `.env` (`.env.example` committed, `.env` ignored) | `services/firebase.ts`, `.env.example`, `.gitignore` |
| A `games` document per hand with all required fields + trick log | `historyService.buildRecord` |
| Offline queue in AsyncStorage, retried on start and on History open; toast | `saveHandResult`, `flushQueue`, `StartupSync` |
| History: newest first, Won/Lost badge, bid, Rang, score; pull-to-refresh; Lottie loading; empty and error states with Retry; stats header | `src/app/history/index.tsx` |
| History Detail with the trick-by-trick log | `src/app/history/[id].tsx` |
| Works without Firebase and explains it | History "not configured" notice, ResultModal save line |
| Step-by-step setup + development rules | `README.md` → Firebase setup |

## 8. Extra — Online multiplayer rooms

| Requirement | Where |
|---|---|
| Host-authoritative: only the host runs the (unchanged) engine and writes state; others send action requests | `src/online/HostController.ts`, `OnlineRoomProvider.tsx` |
| Same rules as offline (engine reused, no duplicated logic) | `HostController.handleAction` → `engine.applyAction` |
| Invalid / out-of-turn / stale / double-tap requests rejected with a reason (toast + inline) | `handleAction` (seat, version, engine); tests in `src/online/__tests__/online.test.ts` |
| Hidden information never in the public room document; each hand readable only by its owner | `protocol.toPublicState`, `handDocFor`, `firestore.rules`; leak test checks every write of whole games |
| 2–4 humans + bots in empty seats; bots run on the host with the existing AI | `HostController.addBot/playBot` |
| Every player sees the table from their own seat (me = South, partner = North) | `protocol.toLocalView` |
| Firebase Anonymous Auth with AsyncStorage persistence | `src/services/auth.ts` |
| Room codes: 6 chars, no 0/O/1/I/L, unique (transaction) | `roomCode.ts`, `roomService.createRoom` |
| Lobby: code + Copy/Share, seats with team colours, host crown, connection status, tap to sit, bots, Start, Leave | `src/app/online/lobby.tsx` |
| Online table reuses the game components; "Waiting for <name>…"; room code + connection indicator; host-only Next Hand | `src/app/online/game.tsx` |
| Edge cases: missing/full/started room, seat races, disconnect → bot (+ toast) and seat returned, host leaves → room closes, background resync, offline banner, listener cleanup | `roomService.joinRoom`, `assignSeatRequests`, `replaceDisconnected`, `restoreReturning`, `OnlineRoomProvider` |
| Online hands saved to `games` with mode/roomCode/player names; Online badge + players in History | `useOnlineHistory.ts`, `historyService`, `src/app/history/*` |
| Security rules file + publishing steps | `firestore.rules`, README → Firebase setup |
