/** The participant token of each link, kept in this browser so a reload still shows the person's own cube.
 * Web only (localStorage); on native it lives for the session. Losing it loses access to the results, not the results. */
const memory = new Map<string, string>();
const key = (link: string) => `choisys.share.${link}`;

export const participantStore = {
  get(link: string): string | null {
    try { return globalThis.localStorage?.getItem(key(link)) ?? memory.get(link) ?? null; } catch { return memory.get(link) ?? null; }
  },
  set(link: string, token: string): void {
    memory.set(link, token);
    try { globalThis.localStorage?.setItem(key(link), token); } catch { /* private mode: memory only */ }
  },
};
