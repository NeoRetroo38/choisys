import * as SecureStore from 'expo-secure-store';
import type { TokenStorage } from './sessionController';

const key = 'choisys.auth.session.v1';
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** Only the revocable session token is stored, never an email/password pair. */
export const tokenStorage: TokenStorage = {
  getItem: () => SecureStore.getItemAsync(key, options),
  setItem: token => SecureStore.setItemAsync(key, token, options),
  deleteItem: () => SecureStore.deleteItemAsync(key, options),
};
