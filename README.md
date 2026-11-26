# Rang — the hidden-trump card game

A 4-player trick-taking card game (**Rang**) for Android and iOS, built with **Expo (React Native) + TypeScript**.
You play South with a bot partner (North) against two bot opponents (West and East). The game has an
original "Midnight Lounge" look: a deep-navy room, emerald felt table, brass and gold accents, and cards
drawn entirely in code.

> University project for *Software for Mobile Devices*.

---

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
- **Three bots** (Noor, Bilal, Sana) with Easy and Normal difficulty. They only ever see public information,
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
- **Bonus — cloud history (Firebase Cloud Firestore)**:
  - Every finished hand is saved with a trick-by-trick log.
  - If saving fails, the hand goes to an offline queue that retries later.
  - A History screen with stats, pull-to-refresh, and loading, empty and error states.
  - A History Detail screen.
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
| Tests | Jest (`jest-expo`) — 296 engine and bot tests |

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
npm test             # run the Jest test suite
npm run typecheck    # TypeScript check (tsc --noEmit)
npx expo-doctor      # dependency / config health check
```

## Firebase setup (cloud history — optional)

The app works fully without Firebase: finished games are then kept in a local queue and shown on the History
screen. To enable cloud history:

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
6. Simple **development** security rules (Firestore → Rules). These let the app create and read game
   documents but not change or delete them:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /games/{gameId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['deviceId', 'bid', 'winnerTeam'])
                       && request.resource.data.bid is int;
         allow update, delete: if false;
       }
     }
   }
   ```

   These rules are for a student project. A production app would add Firebase Authentication and restrict
   reads to the owner.

`.env` is git-ignored, so your keys are never committed.

## Folder structure

```
assets/
  images/            app icon, adaptive icon layers, splash (original art)
  lottie/            LottieFiles JSON animations + CREDITS.md
docs/
  PROJECT_GUIDE.md   file-by-file guide, state machine, data flow (for the viva)
  RUBRIC_CHECKLIST.md  rubric criterion → features/files
src/
  app/               Expo Router screens: _layout, index (Home), game, settings, history/index, history/[id]
  components/        UI building blocks (Card, Hand, Table, Seat, TrickArea, BiddingPanel, …)
  context/           GameProvider (useReducer + bots), SettingsProvider
  game/              pure engine: types, deck, rules, rulesConfig, engine, ai, players, __tests__/
  hooks/             useLayout (responsive sizes), useFeedback (haptics)
  services/          firebase, historyService (Firestore + offline queue), storage (AsyncStorage)
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
