# Rang — the hidden-trump card game

A 4-player trick-taking card game (**Rang**) for Android and iOS, built with **Expo (React Native) + TypeScript**.
You play South with a bot partner (North) against two bot opponents (West and East). The game has an
original "Midnight Lounge" look: a deep-navy room, emerald felt table, brass and gold accents, and cards
drawn entirely in code.

> University project for *Software for Mobile Devices*.

---

## Download (Android APK)

- **Permanent link (GitHub Release v1.0.0):** https://github.com/muhammadsammad42/rang-card-game/releases/download/v1.0.0/rang-card-game-v1.0.0.apk
- **EAS build page:** https://expo.dev/accounts/sammad897/projects/rang-card-game/builds/8a1eb17c-529e-4e46-b1a7-0e129cca7e6f

Open the link on an Android phone, download the APK and allow "Install unknown apps" when asked.
Built with EAS Build (`eas build --platform android --profile preview`); the Firebase config comes from
EAS environment variables (preview environment), never from a committed `.env`.

## Features

- **The full Rang rules**, in a pure, unit-tested game engine:
  - 5-card bidding round (8–13; a bid of 13 ends bidding; all pass → the first player bids 8).
  - Hidden Rang: the bidder places one card face down, and its suit is the secret trump.
  - Follow-suit enforcement.
  - Who may reveal: the bidder at any time on their turn, or anyone who can't follow suit.
  - Trump rules after the reveal.
  - The **middle pile**: after the reveal, tricks wait in the middle until the same player wins two tricks
    in a row; leftovers go to the last trick's winner.
  - Win/lose at the bid boundary, a rotating dealer, and a session scoreboard.
- **Three bots** (Hassan, Ali — your partner — and Abdullah) with Easy and Normal difficulty. They only ever see public information,
  so they cannot cheat.
- **Animations**
  - **LottieFiles** (played with `lottie-react-native`): the Home ambience, the Rang-reveal burst, a sparkle
    when the pile is collected, the win trophy and confetti, the lose animation, loading, and saving to the cloud.
  - **Reanimated**: dealing, card lift, cards flying to the table, the trick sweeping to its winner or the pile,
    the 3-D Rang flip, the turn-glow pulse, button press feedback, the invalid-move shake, and screen fades.
- **Interaction**: tap to select and tap again (or swipe up) to play; legal cards are highlighted and illegal
  ones dimmed; haptics; clear inline error messages.
- **Restart and replay**: Next Hand, Restart Hand, Restart Match and Quit (with confirmations) from the pause
  menu and the result screen.
- **Stability**: a global error boundary; every action is validated; pauses on app backgrounding and leaving
  the screen; timers are always cleaned up; works offline.
- **Bonus — cloud history (Firebase Cloud Firestore) — working and verified against the live database**:
  - Every finished hand is saved with a trick-by-trick log.
  - If saving fails, the hand goes to an offline queue that retries later.
  - A History screen with stats, pull-to-refresh, and loading, empty and error states.
  - A History Detail screen.
- **Online multiplayer rooms**:
  - 2–4 players on their own phones, with bots filling empty seats;
  - 6-character room codes, a lobby with seats and Copy/Share;
  - host-authoritative play using the same engine, so it plays exactly like offline;
  - disconnect handling (a bot takes over the seat), and online games saved to History with an "Online" badge.
- **Responsive**: works on small phones up to tablets, respects safe areas, and is accessible (labels,
  contrast, readable sizes).

## Tech stack

| Area | Choice |
|---|---|
| Framework | Expo SDK 58, React Native 0.88, React 19, TypeScript |
| Navigation | Expo Router (file-based, routes in `src/app/`) |
| State | Pure TS engine + `useReducer` + React Context |
| Animation | `lottie-react-native` (LottieFiles), `react-native-reanimated` 4, `react-native-worklets` |
| Gestures | `react-native-gesture-handler` 3 |
| Graphics | `react-native-svg`, `expo-linear-gradient`, `@expo/vector-icons` |
| Storage | `@react-native-async-storage/async-storage` |
| Cloud | Firebase JS SDK (Cloud Firestore) |
| Feedback | `expo-haptics` |
| Tests | Jest (`jest-expo`) — 352 offline tests (engine, bots, history, online layer, UI helpers) + 3 live Firestore tests |

Everything runs in **Expo Go**; no development build or prebuild is needed.

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with **Expo Go** (Android) or the Camera app (iOS). Your phone and computer must be on
the same Wi-Fi network; if they are not, use `npx expo start --tunnel`.

Other commands:

```bash
npm test             # run the Jest test suite (offline; the live Firebase test is skipped)
npm run typecheck    # TypeScript check (tsc --noEmit)
npx expo lint        # ESLint (Expo config)
npx expo-doctor      # dependency / config health check
RUN_FIREBASE_IT=1 npx jest firebase.integration   # live Firestore round trip (needs .env; Git Bash/macOS/Linux)
```

## Firebase setup (cloud history — bonus)

**Status: working.** The app is connected to the Firebase project `rang-card-game-4c317`, using the
`(default)` Cloud Firestore database. A live test (`src/services/__tests__/firebase.integration.test.ts`)
proves the full round trip using the app's own code:
- `saveHandResult` writes a document to `games`;
- the History query (`fetchHistory`) and History Detail (`fetchGame`) load it back;
- a game queued while offline is uploaded by `flushQueue`.

**No composite index is needed**: History filters on one field (`deviceId ==`) and sorts on the device.

The app also works fully without Firebase: finished games are then kept in a local queue and shown on the
History screen. To set up your own project:

1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics is not needed).
2. In the project, open **Build → Firestore Database → Create database**. Choose a location and start in
   **test mode** for development.
3. Open **Project settings** (gear icon) → **Your apps** → click the **Web** icon (`</>`) → register an app
   (any nickname; no hosting needed). Firebase shows a `firebaseConfig` object.
4. In the project folder, copy `.env.example` to `.env` and paste the values:

   ```env
   EXPO_PUBLIC_FIREBASE_API_KEY=...
   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project
   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   EXPO_PUBLIC_FIREBASE_APP_ID=...
   ```

5. Restart the dev server with `npx expo start --clear`, so the new variables are picked up.
6. **Enable Anonymous sign-in** (needed for online play): Firebase Console → **Build → Authentication** →
   **Get started** → **Sign-in method** → **Anonymous** → **Enable** → **Save**.
7. **Publish the security rules** in [`firestore.rules`](firestore.rules). Do this before your demo: *test
   mode* rules expire 30 days after the database was created, and after that every save fails.
   - **Console:** Firestore Database → **Rules** → replace everything with the contents of `firestore.rules`
     → **Publish**.
   - **or CLI:** `npx firebase-tools login`, then `npx firebase-tools deploy --only firestore:rules`
     (`firebase.json` and `.firebaserc` are already set up).

   The `games` rule is the same as before (history still saves without signing in). The room rules let only a
   room's host write the room and the private hands, let each player read **only their own** hand, and let
   players create move requests only for themselves.

`.env` is git-ignored, so your keys are never committed.

## Play online (multiplayer rooms)

Two to four players on their own phones, with bots in any empty seats.

1. **Host:** Home → **Play Online** → **Create Room**. Share the 6-character code (Copy / Share buttons).
2. **Friends:** Home → **Play Online** → type the code → **Join Room**. Everyone taps an empty seat to sit
   down; partners sit opposite.
3. The host can **Add bot** to empty seats (or remove bots), then taps **Start Game** once all four seats
   are filled.
4. Everyone sees the table from their own seat (you are always at the bottom). When it's someone else's
   turn you'll see "Waiting for <name>…". After each hand only the host can deal the next one.

**How it works (host-authoritative).** The host's phone runs the same game engine as single-player and is
the only device that writes the game state:
- other players send *move requests*;
- the host checks each one with the engine (rejected moves come back with a reason);
- the host publishes the new public state and each player's private hand.

Bots in empty seats play on the host's phone. If a player's phone goes silent for about 30 seconds, a bot
takes over their seat until the next hand. If the host leaves, the room closes for everyone.

**Known limitation:** without Cloud Functions, the host's phone holds the full game state (including all
hands) in memory, so a tampered host app could cheat. Other players can never read each other's cards.

**Testing with several players:**
- **Phone + emulator:** run `npx expo start`, open the app on the Android emulator (press `a`) and on your
  phone (scan the QR code with Expo Go). Create the room on one and join from the other.
- **Extra players in the browser:** press `w` in the Expo terminal (or open `http://localhost:8081`). Each
  browser tab signs in as a different anonymous player, so 2 tabs + 2 phones make 4 humans. The web version
  is only meant for testing; the app targets Android and iOS.

## Folder structure

```
assets/
  images/            app icon, adaptive icon layers, splash (original art)
  lottie/            LottieFiles JSON animations + CREDITS.md
docs/
  PROJECT_GUIDE.md   file-by-file guide, state machine, data flow (for the viva)
  RUBRIC_CHECKLIST.md  rubric criterion → features/files
src/
  app/               Expo Router screens: _layout, index (Home), game, settings, history/index, history/[id],
                     online/_layout, online/menu, online/lobby, online/game
  components/        UI building blocks (Card, Hand, Table, Seat, TrickArea, BiddingPanel, …)
  context/           GameProvider (useReducer + bots), SettingsProvider
  game/              pure engine: types, deck, rules, rulesConfig, engine, ai, players, __tests__/
  hooks/             useLayout (responsive sizes), useFeedback (haptics), useIsOnline (NetInfo)
  online/            multiplayer: protocol, HostController, roomService, OnlineRoomProvider, roomCode, __tests__/
  services/          firebase, auth (anonymous), historyService (Firestore + offline queue), storage (AsyncStorage)
firestore.rules      Firestore security rules (history + online rooms)
  theme/             theme.ts (design tokens), animations.ts (Lottie registry)
  utils/             format and status text helpers
```

## Rule decisions

Rules the reference game does not spell out are named constants in
[`src/game/rulesConfig.ts`](src/game/rulesConfig.ts): who deals first, who bids first, what happens when
everyone passes, whether the reveal trick goes to the pile, the streak length, the streak reset, who gets the
leftover pile, and the bidder's auto-reveal. Change them there if the reference behaves differently; the tests
document the current choices.

## Credits

- Lottie animations from **[LottieFiles](https://lottiefiles.com)**. See
  [`assets/lottie/CREDITS.md`](assets/lottie/CREDITS.md) for each animation and its creator.
- Playing cards, card backs, suit symbols and the app icon are original artwork drawn in code (SVG and Views).
- Icons from `@expo/vector-icons` (Material Community Icons).

## Screenshots

> Add screenshots to `screenshots/` and link them here.

| Home | Bidding | Table | Rang revealed | Result | History |
|---|---|---|---|---|---|
| `screenshots/home.png` | `screenshots/bidding.png` | `screenshots/table.png` | `screenshots/reveal.png` | `screenshots/result.png` | `screenshots/history.png` |
