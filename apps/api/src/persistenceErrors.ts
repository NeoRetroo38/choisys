export class PersistenceInputError extends Error {
  readonly code = 'INVALID_PERSISTENCE_INPUT';
}

export class PersistenceNotFoundError extends Error {
  readonly code = 'PERSISTENCE_NOT_FOUND';
}

export class AccessDeniedError extends Error {
  readonly code = 'ACCESS_DENIED';
}
