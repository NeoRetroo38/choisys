import type { TokenStorage } from './sessionController';

const key = 'choisys.auth.session.v1';
/** Browser preview is scoped to a tab. Native builds use the OS secure store. */
export const tokenStorage: TokenStorage = {
  async getItem() { return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key); },
  async setItem(token) { window.sessionStorage.setItem(key, token); },
  async deleteItem() { window.sessionStorage.removeItem(key); },
};
