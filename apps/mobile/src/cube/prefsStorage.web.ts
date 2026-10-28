const key = 'choisys.cube.prefs.v1';
/** Cosmetic preference, so it survives the tab (unlike run history). Private mode falls back to defaults. */
export const prefsStorage = {
  async getItem() { try { return window.localStorage.getItem(key); } catch { return null; } },
  async setItem(value: string) { try { window.localStorage.setItem(key, value); } catch { /* private mode */ } },
};
