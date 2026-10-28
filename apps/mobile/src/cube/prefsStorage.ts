import * as SecureStore from 'expo-secure-store';

const key = 'choisys.cube.prefs.v1';
export const prefsStorage = {
  getItem: () => SecureStore.getItemAsync(key),
  setItem: (value: string) => SecureStore.setItemAsync(key, value),
};
