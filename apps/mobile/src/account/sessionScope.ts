import type { AuthState } from '../auth/sessionController';

export interface AccountSessionTicket { readonly id: number; readonly token: string | null }

/** Scope UI data to one authenticated lifecycle, including logout followed by the same account. */
export class AccountSessionScope {
  private id = 0;
  private status: AuthState['status'] | null = null;
  private token: string | null = null;
  private profileId: string | null = null;

  observe(auth: AuthState): boolean {
    const profileId = auth.profile?.id ?? null;
    if (auth.status === this.status && auth.token === this.token && profileId === this.profileId) return false;
    this.status = auth.status;
    this.token = auth.token;
    this.profileId = profileId;
    this.id++;
    return true;
  }

  capture(auth: AuthState): AccountSessionTicket {
    this.observe(auth);
    return { id: this.id, token: auth.token };
  }

  isCurrent(ticket: AccountSessionTicket, auth: AuthState): boolean {
    this.observe(auth);
    return this.status === 'signedIn' && ticket.token !== null && ticket.id === this.id && ticket.token === this.token;
  }
}

/** Join concurrent refreshes for this lifecycle without sharing work across accounts. */
export class AccountRefreshGate {
  private pending: { id: number; promise: Promise<void> } | null = null;

  run(id: number, refresh: () => Promise<void>): Promise<void> {
    if (this.pending?.id === id) return this.pending.promise;
    const promise = Promise.resolve().then(refresh);
    this.pending = { id, promise };
    const release = () => { if (this.pending?.promise === promise) this.pending = null; };
    void promise.then(release, release);
    return promise;
  }

  clear(): void { this.pending = null; }
}
