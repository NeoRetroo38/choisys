import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { createAuthApi } from './authApi';
import { SessionController, type AuthState } from './sessionController';
import { tokenStorage } from './tokenStorage';

const context = createContext<{ controller: SessionController; state: AuthState } | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() => new SessionController(createAuthApi(process.env.EXPO_PUBLIC_API_URL), tokenStorage));
  const [state, setState] = useState(controller.getState);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.bootstrap();
    // A resumed app revalidates the stored session without displaying the login form first.
    let previous = AppState.currentState;
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active' && previous !== 'active' && controller.getState().status === 'signedIn') void controller.bootstrap();
      previous = next;
    });
    return () => { unsubscribe(); listener.remove(); };
  }, [controller]);
  return <context.Provider value={{ controller, state }}>{children}</context.Provider>;
}

export function useAuth() {
  const value = useContext(context);
  if (!value) throw new Error('AuthProvider is required.');
  return value;
}
