/**
 * firebase-auth-rn.d.ts — typing for getReactNativePersistence.
 *
 * On iOS/Android, Metro resolves `firebase/auth` to Firebase's React Native
 * build, which exports getReactNativePersistence. The package's default type
 * definitions describe the browser build and omit it, so we declare it here.
 */
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
