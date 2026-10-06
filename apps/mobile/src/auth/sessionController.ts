export interface AuthProfile {
  id: string;
  displayName: string;
}

export interface SignInCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends SignInCredentials {
  displayName: string;
}

export interface AuthSessionResponse {
  ok: true;
  token: string;
  expiresAt: string;
  profile: AuthProfile;
}

export interface AuthMeResponse {
  ok: true;
  expiresAt: string;
  profile: AuthProfile;
}

export interface AuthApi {
  signIn(credentials: SignInCredentials): Promise<AuthSessionResponse>;
  register(credentials: RegisterCredentials): Promise<AuthSessionResponse>;
  me(token: string): Promise<AuthMeResponse>;
  signOut(token: string): Promise<unknown>;
}

/** Native adapters must keep the opaque token in platform secure storage. */
export interface TokenStorage {
  getItem(): Promise<string | null>;
  setItem(token: string): Promise<void>;
  deleteItem(): Promise<void>;
}

export interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn' | 'error';
  token: string | null;
  profile: AuthProfile | null;
  error: string | null;
}

export class AuthClientError extends Error {
  constructor(public readonly code: string, message?: string, public readonly status?: number) {
    super(message ?? code);
    this.name = 'AuthClientError';
  }
}

const errorCode = (error: unknown): string | undefined => (
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code : undefined
);

function unauthorized(error: unknown): boolean {
  return errorCode(error) === 'AUTH_REQUIRED'
    || (typeof error === 'object' && error !== null && 'status' in error && error.status === 401);
}

function authErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case 'INVALID_CREDENTIALS': return 'El correo o la contraseña no son correctos.';
    case 'ACCOUNT_EXISTS': return 'Ya existe una cuenta con este correo. Inicia sesión.';
    case 'AUTH_RATE_LIMITED': return 'Has realizado demasiados intentos. Espera un momento y vuelve a intentarlo.';
    case 'INVALID_REQUEST': return 'Revisa el nombre, el correo y la contraseña.';
    case 'REQUEST_TIMEOUT': return 'La conexión ha tardado demasiado. Vuelve a intentarlo.';
    case 'CONFIGURATION_ERROR': return 'La conexión con el servicio todavía no está configurada.';
    default: return 'No se ha podido conectar con el servicio. Vuelve a intentarlo.';
  }
}

/**
 * A framework-independent authentication lifecycle. Initial loading is deliberate:
 * the login screen is only available once secure storage confirms no valid session.
 * Operation IDs discard stale network results; the storage queue also prevents a
 * delayed credential write from overwriting a subsequent logout or login.
 */
export class SessionController {
  private state: AuthState = { status: 'loading', token: null, profile: null, error: null };
  private readonly listeners = new Set<(state: AuthState) => void>();
  private operation = 0;
  private storageQueue: Promise<void> = Promise.resolve();

  constructor(private readonly api: AuthApi, private readonly storage: TokenStorage) {}

  getState = (): AuthState => this.state;

  subscribe = (listener: (state: AuthState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(state: AuthState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  private current(operation: number): boolean {
    return operation === this.operation;
  }

  private inStorageOrder<T>(action: () => Promise<T>): Promise<T> {
    const result = this.storageQueue.then(action);
    this.storageQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  bootstrap = async (): Promise<void> => {
    const operation = ++this.operation;
    let token = this.state.token;
    this.update({ status: 'loading', token, profile: null, error: null });
    try {
      token = await this.inStorageOrder(() => this.storage.getItem());
      if (!this.current(operation)) return;
      if (!token) {
        this.update({ status: 'signedOut', token: null, profile: null, error: null });
        return;
      }
      this.update({ status: 'loading', token, profile: null, error: null });
      const result = await this.api.me(token);
      if (this.current(operation)) {
        this.update({ status: 'signedIn', token, profile: result.profile, error: null });
      }
    } catch (error) {
      if (!this.current(operation)) return;
      if (token && unauthorized(error)) {
        try {
          await this.inStorageOrder(async () => {
            if (this.current(operation)) await this.storage.deleteItem();
          });
          if (this.current(operation)) {
            this.update({ status: 'signedOut', token: null, profile: null, error: null });
          }
        } catch {
          if (this.current(operation)) {
            this.update({ status: 'error', token, profile: null, error: 'No se ha podido limpiar la sesión guardada. Vuelve a intentarlo.' });
          }
        }
        return;
      }
      this.update({ status: 'error', token, profile: null, error: authErrorMessage(error) });
    }
  };

  signIn = (credentials: SignInCredentials): Promise<void> => this.authenticate(() => this.api.signIn(credentials));

  register = (credentials: RegisterCredentials): Promise<void> => this.authenticate(() => this.api.register(credentials));

  private async authenticate(request: () => Promise<AuthSessionResponse>): Promise<void> {
    const operation = ++this.operation;
    this.update({ status: 'loading', token: null, profile: null, error: null });
    let result: AuthSessionResponse;
    try {
      result = await request();
    } catch (error) {
      if (this.current(operation)) {
        this.update({ status: 'signedOut', token: null, profile: null, error: authErrorMessage(error) });
      }
      return;
    }
    if (!this.current(operation)) {
      // An abandoned successful login must not leave a newly issued session active.
      await this.api.signOut(result.token).catch(() => undefined);
      return;
    }
    try {
      await this.inStorageOrder(async () => {
        if (this.current(operation)) await this.storage.setItem(result.token);
      });
      if (this.current(operation)) {
        this.update({ status: 'signedIn', token: result.token, profile: result.profile, error: null });
      }
    } catch {
      if (!this.current(operation)) return;
      // A failed write may have partially persisted. Revoke before trying to clear.
      let revoked = false;
      try {
        await this.api.signOut(result.token);
        revoked = true;
      } catch (error) {
        revoked = unauthorized(error);
      }
      if (!this.current(operation)) return;
      if (revoked) {
        try {
          await this.inStorageOrder(async () => {
            if (this.current(operation)) await this.storage.deleteItem();
          });
        } catch { /* Keep the blocking error so the user can retry storage access. */ }
      }
      if (this.current(operation)) {
        this.update({ status: 'error', token: revoked ? null : result.token, profile: null, error: 'No se ha podido guardar la sesión de forma segura. Vuelve a intentarlo.' });
      }
    }
  }

  signOut = async (): Promise<void> => {
    const operation = ++this.operation;
    const previous = this.state;
    let token = previous.token;
    this.update({ ...previous, status: 'loading', error: null });
    try {
      // Wait for any in-flight secure write, including one started by a stale login.
      token = await this.inStorageOrder(() => this.storage.getItem()) ?? token;
      if (!this.current(operation)) return;
      if (token) {
        try {
          await this.api.signOut(token);
        } catch (error) {
          if (!unauthorized(error)) throw error;
        }
      }
      if (!this.current(operation)) return;
    } catch (error) {
      if (this.current(operation)) {
        this.update({ status: token && previous.profile ? 'signedIn' : 'error', token, profile: previous.profile, error: 'No se ha podido cerrar la sesión. Comprueba la conexión y vuelve a intentarlo.' });
      }
      return;
    }
    try {
      await this.inStorageOrder(async () => {
        if (this.current(operation)) await this.storage.deleteItem();
      });
      if (this.current(operation)) {
        this.update({ status: 'signedOut', token: null, profile: null, error: null });
      }
    } catch {
      if (this.current(operation)) {
        this.update({ status: 'error', token, profile: null, error: 'La sesión se ha cerrado, pero no se ha podido limpiar del dispositivo. Vuelve a intentarlo.' });
      }
    }
  };
}
