/**
 * firebase.ts — initialises the Firebase JS SDK and Cloud Firestore.
 *
 * The config comes from EXPO_PUBLIC_FIREBASE_* variables in `.env` (see
 * `.env.example`). If any value is missing, `getDb()` returns null and the app
 * keeps working offline — games are queued locally instead.
 */
import { getApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, getFirestore, initializeFirestore } from 'firebase/firestore';

// Expo inlines EXPO_PUBLIC_* variables at build time, so each must be referenced literally.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** True only when every config value is present (and not a placeholder). */
export const isFirebaseConfigured: boolean = Object.values(firebaseConfig).every(
  (v) => typeof v === 'string' && v.trim().length > 0 && !v.startsWith('your-'),
);

let db: Firestore | null = null;

/** Lazily creates the Firestore instance. Returns null if not configured or if init fails. */
export function getDb(): Firestore | null {
  if (!isFirebaseConfigured) return null;
  if (db) return db;
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    try {
      // Long polling is the most reliable transport on React Native.
      db = initializeFirestore(app, { experimentalForceLongPolling: true });
    } catch {
      db = getFirestore(app); // already initialised (e.g. after a fast refresh)
    }
  } catch (e) {
    if (__DEV__) console.warn('Firebase init failed:', (e as Error).message);
    db = null;
  }
  return db;
}
