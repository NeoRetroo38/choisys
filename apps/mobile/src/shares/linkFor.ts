import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { PUBLIC_BASE, PUBLIC_ORIGIN, shareUrl } from './link';

/** On the web, the address this app is served from (with its sub-path); elsewhere, the public site. */
export function linkFor(token: string): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const base = (Constants.expoConfig?.experiments as { baseUrl?: string } | undefined)?.baseUrl ?? '';
    return shareUrl(token, window.location.origin, base);
  }
  return shareUrl(token, PUBLIC_ORIGIN, PUBLIC_BASE);
}
