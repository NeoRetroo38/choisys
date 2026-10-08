import type { ApiErrorCode, ApiErrorResponse } from '@scenarys/shared';
const messages: Record<ApiErrorCode, string> = {
  INVALID_REQUEST: 'Invalid request.', PAYLOAD_TOO_LARGE: 'Request too large.',
  UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json.',
  ORIGIN_NOT_ALLOWED: 'Origin not allowed.', NOT_FOUND: 'Endpoint not found.',
  INTERNAL_ERROR: 'Unexpected service error.', SESSION_NOT_FOUND: 'Session missing or expired. Start a new session.',
  AUTH_REQUIRED: 'Sign in to continue.', AUTH_UNAVAILABLE: 'Account service unavailable. Try again later.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.', ACCOUNT_EXISTS: 'Unable to register this email. Try signing in.',
  AUTH_RATE_LIMITED: 'Too many attempts. Try again later.',
  SESSION_LIMIT_REACHED: 'Session capacity reached. Try again later.', SESSION_BUSY: 'Session request in progress. Try again.',
  SESSION_CONFLICT: 'Phase or selection conflicts with this session.',
  FORBIDDEN: 'You do not have permission for this.',
  ALREADY_DECIDED: 'This role request has already been decided.',
  ROLE_REQUESTS_UNAVAILABLE: 'Role requests are not available on this server.',
  NEO_CUBE_UNAVAILABLE: 'Local evaluation service unavailable.', NEO_CUBE_TIMEOUT: 'Local evaluation timed out. Retry the same selection.',
  NEO_CUBE_INVALID_RESPONSE: 'Invalid local evaluation response.', NEO_CUBE_AUTH_FAILED: 'Local evaluation authentication failed.',
};
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: ApiErrorCode) { super(messages[code]); }
  response(): ApiErrorResponse { return { ok: false, error: { code: this.code, message: this.message } }; }
}
