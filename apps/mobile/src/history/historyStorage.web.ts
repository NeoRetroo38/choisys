import type { HistoryStorage } from './runHistory';

const key = 'choisys.runs.v1';
/** Browser preview is scoped to a tab. Native builds use the OS secure store. */
export const historyStorage: HistoryStorage = {
  async getItem() { return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key); },
  async setItem(value) { window.sessionStorage.setItem(key, value); },
};
