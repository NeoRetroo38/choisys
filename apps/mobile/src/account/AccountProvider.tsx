import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { MeProfile } from '@scenarys/shared';
import { useAuth } from '../auth/AuthProvider';
import { ApiRequestError } from '../api/request';
import { createAccountApi, type AccountApi, type OwnRoleRequest } from './accountApi';
import { capabilitySet, navigationModel, type Capabilities, type NavigationModel } from './capabilities';
import { AccountRefreshGate, AccountSessionScope } from './sessionScope';

/**
 * AppShell state: identity + capabilities + navigation model, loaded once from GET /me after sign-in.
 * `unavailable` means the server has no /me (no database): the experience still works, the account surface hides.
 */
export interface AccountState {
  status: 'loading' | 'ready' | 'unavailable' | 'error';
  profile: MeProfile | null;
  /** The person's own role request, if the server reports one. */
  roleRequest: OwnRoleRequest | null;
  capabilities: Capabilities;
  model: NavigationModel;
}

interface AccountContext extends AccountState {
  api: AccountApi;
  refresh: () => Promise<void>;
  setProfile: (profile: MeProfile, capabilities: string[], roleRequest?: OwnRoleRequest | null) => void;
}

const empty = capabilitySet(null);
const emptyState: AccountState = { status: 'loading', profile: null, roleRequest: null, capabilities: empty, model: navigationModel(empty) };
const context = createContext<AccountContext | null>(null);

export function AccountProvider({ children }: PropsWithChildren) {
  const { controller, state: auth } = useAuth();
  const [scope] = useState(() => new AccountSessionScope());
  const [refreshGate] = useState(() => new AccountRefreshGate());
  const mounted = useRef(true);
  const ticket = useMemo(() => scope.capture(controller.getState()), [scope, controller, auth.status, auth.token, auth.profile?.id]);
  const isCurrent = useCallback(() => mounted.current && scope.isCurrent(ticket, controller.getState()), [scope, ticket, controller]);
  // Bind every endpoint to this token. A delayed action must never use the next person's token.
  const api = useMemo(() => createAccountApi(process.env.EXPO_PUBLIC_API_URL, () => ticket.token, fetch, isCurrent,
    () => { void controller.bootstrap(); }), [ticket, isCurrent, controller]);
  const [bound, setBound] = useState<{ id: number; state: AccountState }>({ id: -1, state: emptyState });
  const refreshId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = controller.subscribe(next => {
      if (scope.observe(next)) {
        refreshId.current++;
        refreshGate.clear();
        setBound({ id: -1, state: emptyState });
      }
    });
    return () => { mounted.current = false; refreshId.current++; refreshGate.clear(); unsubscribe(); };
  }, [controller, scope, refreshGate]);

  const setProfile = useCallback((profile: MeProfile, keys: string[], roleRequest?: OwnRoleRequest | null) => {
    if (!isCurrent() || profile.id !== controller.getState().profile?.id) return;
    const capabilities = capabilitySet(keys);
    setBound(current => !isCurrent() ? current : { id: ticket.id, state: {
      status: 'ready', profile, capabilities, model: navigationModel(capabilities),
      roleRequest: roleRequest === undefined && current.id === ticket.id ? current.state.roleRequest : roleRequest ?? null,
    } });
  }, [controller, isCurrent, ticket.id]);

  const refresh = useCallback(() => {
    if (!isCurrent()) return Promise.resolve();
    return refreshGate.run(ticket.id, async () => {
      if (!isCurrent()) return;
      const operation = ++refreshId.current;
      try {
        const me = await api.me();
        if (!isCurrent() || operation !== refreshId.current) return;
        setProfile(me.profile, me.capabilities, me.roleRequest);
      } catch (error) {
        if (!isCurrent() || operation !== refreshId.current) return;
        const status = error instanceof ApiRequestError && error.code === 'NOT_FOUND' ? 'unavailable' : 'error';
        setBound({ id: ticket.id, state: { ...emptyState, status } });
      }
    });
  }, [api, controller, setProfile, isCurrent, ticket.id, refreshGate]);

  useEffect(() => { if (auth.status === 'signedIn') void refresh(); }, [auth.status, auth.token, refresh]);

  // Mask old data during the very first render of a changed session, before effects run.
  const state = isCurrent() && bound.id === ticket.id ? bound.state : emptyState;
  // Reset every consumer's runs, password drafts and admin rows even if React batches the loading state.
  return <context.Provider value={{ ...state, api, refresh, setProfile }}>
    <Fragment key={ticket.id}>{children}</Fragment>
  </context.Provider>;
}

export function useAccount() {
  const value = useContext(context);
  if (!value) throw new Error('AccountProvider is required.');
  return value;
}
