import * as SecureStore from 'expo-secure-store';
import type { HistoryStorage } from './runHistory';

const key = 'choisys.runs.v1';
const options: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

/** Only public measurements returned by the product API are stored on the device. */
export const historyStorage: HistoryStorage = {
  getItem: () => SecureStore.getItemAsync(key, options),
  setItem: value => SecureStore.setItemAsync(key, value, options),
};
