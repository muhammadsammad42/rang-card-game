/**
 * useIsOnline.ts — is the device connected to the internet? (NetInfo)
 * Returns true while unknown, so the UI never flashes "offline" on start-up.
 */
import { useNetInfo } from '@react-native-community/netinfo';

export function useIsOnline(): boolean {
  const net = useNetInfo();
  if (net.isConnected === false) return false;
  if (net.isInternetReachable === false) return false;
  return true;
}
