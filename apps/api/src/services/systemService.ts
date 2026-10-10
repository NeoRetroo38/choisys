import type { PrismaClient } from '@prisma/client';
import type { SystemStatusResponse } from '@scenarys/shared';
import type { ConnectionRegistry } from '../connections.js';

export interface EngineProbe { (): Promise<SystemStatusResponse['engine']> }

type Fetch = typeof globalThis.fetch;

/** Health of the local C++ engine. Fixed loopback address; the engine credential never leaves this process. */
export function engineProbe(token: string, timeoutMs = 1500, fetchImpl: Fetch = globalThis.fetch): EngineProbe {
  return async () => {
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl('http://127.0.0.1:8765/health', { redirect: 'manual', signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
      const body = response.ok ? await response.json().catch(() => null) as { ok?: unknown; version?: unknown } | null : null;
      const ok = response.ok && body?.ok === true;
      return { ok, latencyMs: Math.round(performance.now() - started), version: ok && typeof body?.version === 'string' ? body.version.slice(0, 32) : null };
    } catch { return { ok: false, latencyMs: null, version: null }; }
    finally { clearTimeout(timer); }
  };
}

/** One small read-only snapshot for the operator map: numbers and booleans only, no records, no credentials. */
export class SystemService {
  private readonly startedAt = Date.now();
  constructor(
    private readonly db: PrismaClient | null,
    private readonly engine: EngineProbe,
    private readonly connections: ConnectionRegistry,
    private readonly now: () => number = Date.now,
  ) {}

  private async database(): Promise<SystemStatusResponse['database']> {
    if (!this.db) return { configured: false, ok: false, latencyMs: null, counts: null };
    const started = performance.now();
    try {
      const [profiles, runs, roleChanges] = await this.db.$transaction([
        this.db.profile.count(), this.db.cubeData.count({ where: { type: 'RUN' } }), this.db.roleChange.count(),
      ]);
      return { configured: true, ok: true, latencyMs: Math.round(performance.now() - started), counts: { profiles, runs, roleChanges } };
    } catch { return { configured: true, ok: false, latencyMs: null, counts: null }; }
  }

  async status(): Promise<SystemStatusResponse> {
    const [engine, database] = await Promise.all([this.engine(), this.database()]);
    const list = this.connections.list();
    return {
      ok: true, checkedAt: new Date(this.now()).toISOString(),
      api: { version: '0.1.0', uptimeSeconds: Math.round((this.now() - this.startedAt) / 1000) },
      engine, database, connections: { active: list.filter(c => c.active).length, total: list.length },
    };
  }
}
