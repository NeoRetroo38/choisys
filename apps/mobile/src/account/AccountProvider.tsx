import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { MeProfile } from '@scenarys/shared';
import { useAuth } from '../auth/AuthProvider';
import { ApiRequestError } from '../api/request';
import { createAccountApi, type AccountApi, type OwnRoleRequest } from './accountApi';
import { capabilitySet, navigationModel, type Capabilities, type NavigationModel } from './capabilities';

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
const context = createContext<AccountContext | null>(null);

export function AccountProvider({ children }: PropsWithChildren) {
  const { controller, state: auth } = useAuth();
  const api = useMemo(() => createAccountApi(process.env.EXPO_PUBLIC_API_URL, () => controller.getState().token), [controller]);
  const [state, setState] = useState<AccountState>({ status: 'loading', profile: null, roleRequest: null, capabilities: empty, model: navigationModel(empty) });

  const setProfile = useCallback((profile: MeProfile, keys: string[], roleRequest?: OwnRoleRequest | null) => {
    const capabilities = capabilitySet(keys);
    setState(current => ({ status: 'ready', profile, capabilities, model: navigationModel(capabilities),
      roleRequest: roleRequest === undefined ? current.roleRequest : roleRequest }));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setProfile(me.profile, me.capabilities, me.roleRequest);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'AUTH_REQUIRED') { void controller.bootstrap(); return; }
      const status = error instanceof ApiRequestError && error.code === 'NOT_FOUND' ? 'unavailable' : 'error';
      setState({ status, profile: null, roleRequest: null, capabilities: empty, model: navigationModel(empty) });
    }
  }, [api, controller, setProfile]);

  useEffect(() => { if (auth.status === 'signedIn') void refresh(); }, [auth.status, auth.token, refresh]);

  return <context.Provider value={{ ...state, api, refresh, setProfile }}>{children}</context.Provider>;
}

export function useAccount() {
  const value = useContext(context);
  if (!value) throw new Error('AccountProvider is required.');
  return value;
}
