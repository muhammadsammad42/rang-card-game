/**
 * auth.ts — Firebase Anonymous Authentication for online play.
 *
 * Every device signs in anonymously (no account or password needed) so the
 * Firestore security rules can tell players apart. On iOS/Android the session
 * is persisted with AsyncStorage, so the same anonymous user comes back after
 * restarting the app. On web each tab gets its own in-memory user, which lets
 * you open several browser tabs as different players when testing.
 *
 * Requires "Anonymous" to be enabled in Firebase Console → Authentication →
 * Sign-in method.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Auth,
  getAuth,
  getReactNativePersistence,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  User,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { getFirebaseApp } from './firebase';

let auth: Auth | null = null;

/** The Auth instance (created once). Null if Firebase is not configured. */
export function getFirebaseAuth(): Auth | null {
  if (auth) return auth;
  const app = getFirebaseApp();
  if (!app) return null;
  try {
    auth =
      Platform.OS === 'web'
        ? initializeAuth(app, { persistence: inMemoryPersistence })
        : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    auth = getAuth(app); // already initialised (e.g. after a fast refresh)
  }
  return auth;
}

/** Turns Firebase error codes into messages a player can act on. */
export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.includes('operation-not-allowed') || code.includes('configuration-not-found') || code.includes('admin-restricted'))
    return 'Online play is not enabled yet: turn on Anonymous sign-in in Firebase Console → Authentication.';
  if (code.includes('network-request-failed')) return 'No internet connection. Check your network and try again.';
  return 'Could not sign in for online play. Please try again.';
}

/**
 * Resolves with the signed-in user, signing in anonymously if needed.
 * Waits for a persisted session to be restored first so the uid stays stable.
 */
export async function ensureSignedIn(): Promise<User> {
  const a = getFirebaseAuth();
  if (!a) throw Object.assign(new Error('Firebase is not configured'), { code: 'not-configured' });
  const restored = await new Promise<User | null>((resolve) => {
    const unsub = onAuthStateChanged(a, (u) => {
      unsub();
      resolve(u);
    });
  });
  if (restored) return restored;
  const cred = await signInAnonymously(a);
  return cred.user;
}
