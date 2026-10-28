import { useEffect, useState } from 'react';
import { defaultPrefs, parsePrefs, type CubePrefs } from './cubePrefs';
import { prefsStorage } from './prefsStorage';

// One shared copy so every cube on screen updates at once when the user changes the style.
let cache: CubePrefs | null = null;
let loading: Promise<CubePrefs> | null = null;
const listeners = new Set<(prefs: CubePrefs) => void>();
const load = () => loading ??= prefsStorage.getItem().then(parsePrefs, () => defaultPrefs).then(prefs => (cache = prefs));

export function useCubePrefs() {
  const [prefs, setPrefs] = useState<CubePrefs>(cache ?? defaultPrefs);
  useEffect(() => {
    listeners.add(setPrefs);
    void load().then(setPrefs);
    return () => { listeners.delete(setPrefs); };
  }, []);
  const update = (patch: Partial<CubePrefs>) => {
    const next = { ...(cache ?? defaultPrefs), ...patch };
    cache = next;
    listeners.forEach(listener => listener(next));
    void prefsStorage.setItem(JSON.stringify(next)).catch(() => undefined);
  };
  return [prefs, update] as const;
}
