import { AsyncLocalStorage } from 'node:async_hooks';
import type { ConnectionRow } from '@scenarys/shared';

const ACTIVE_MS = 5 * 60_000;
const FORGET_MS = 30 * 60_000;
const MAX_ENTRIES = 1000;

/** Network facts about the request being served, set once per request by the app. */
export interface RequestContext { address: string; userAgent: string }
export const requestContext = new AsyncLocalStorage<RequestContext>();

/** A short human label from the user agent. Never stored raw. */
export function deviceLabel(userAgent: string): string {
  const os = /iPhone|iPad/.test(userAgent) ? 'iPhone/iPad' : /Android/.test(userAgent) ? 'Android'
    : /Macintosh|Mac OS X/.test(userAgent) ? 'Mac' : /Windows/.test(userAgent) ? 'Windows' : /Linux/.test(userAgent) ? 'Linux' : 'Otro';
  const app = /Safari\//.test(userAgent) && !/Chrome|Chromium|Edg\//.test(userAgent) ? 'Safari'
    : /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Expo|okhttp|CFNetwork|Dalvik/.test(userAgent) ? 'App' : 'Cliente';
  return `${os} · ${app}`;
}

export interface Seen { sessionKey: string; profileId: string; displayName: string; role: string }

interface Entry extends Seen { address: string; device: string; since: number; lastSeen: number; requests: number }

/** Who is connected right now. In memory: it resets on restart and holds no secrets, only a short session key. */
export class ConnectionRegistry {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly now: () => number = Date.now) {}

  /** Called after a request authenticated successfully. */
  observe(seen: Seen): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.lastSeen + FORGET_MS <= now) this.entries.delete(key);
    const context = requestContext.getStore();
    const existing = this.entries.get(seen.sessionKey);
    if (!existing && this.entries.size >= MAX_ENTRIES) return;
    const entry = existing ?? { ...seen, address: '', device: '', since: now, lastSeen: now, requests: 0 };
    entry.displayName = seen.displayName;
    entry.role = seen.role;
    entry.lastSeen = now;
    entry.requests++;
    if (context) { entry.address = context.address; entry.device = deviceLabel(context.userAgent); }
    this.entries.set(seen.sessionKey, entry);
  }

  list(): ConnectionRow[] {
    const now = this.now();
    return [...this.entries.values()]
      .filter(e => e.lastSeen + FORGET_MS > now)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .map(e => ({
        id: e.sessionKey, profileId: e.profileId, displayName: e.displayName, role: e.role as ConnectionRow['role'],
        device: e.device, address: e.address, since: new Date(e.since).toISOString(), lastSeen: new Date(e.lastSeen).toISOString(),
        requests: e.requests, active: e.lastSeen + ACTIVE_MS > now,
      }));
  }
}
