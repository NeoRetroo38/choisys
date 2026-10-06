import type { PrismaClient } from '@prisma/client';
import { PersistenceInputError } from '../persistenceErrors.js';

export interface CreateAccountInput {
  email: string;
  passwordHash: string;
  displayName: string;
}

const safeAccountSelect = {
  id: true, email: true, createdAt: true, updatedAt: true, lastLoginAt: true, isActive: true,
  profile: { select: { id: true, role: true, displayName: true, createdAt: true, updatedAt: true } },
} as const;

export function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new PersistenceInputError('Invalid email.');
  }
  return normalized;
}

export function assertPasswordHash(value: string): void {
  const approved = /^(?:\$argon2(?:id|i|d)\$|\$2[aby]\$\d{2}\$|scrypt\$|pbkdf2\$)/;
  if (value.length > 512 || !approved.test(value)) {
    throw new PersistenceInputError('passwordHash must use an approved password hashing format.');
  }
}

export function assertDisplayName(value: string): string {
  const result = value.trim();
  if (result.length < 1 || result.length > 120) throw new PersistenceInputError('Invalid displayName.');
  return result;
}

export class AccountService {
  constructor(private readonly db: PrismaClient) {}

  /** Creates the account and its required profile atomically. No plaintext password is accepted. */
  createAccount(input: CreateAccountInput) {
    assertPasswordHash(input.passwordHash);
    return this.db.account.create({
      data: {
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash,
        profile: { create: { displayName: assertDisplayName(input.displayName), role: 'USER' } },
      },
      select: safeAccountSelect,
    });
  }

  getAccount(where: { id: string } | { email: string }) {
    const lookup = 'email' in where ? { email: normalizeEmail(where.email) } : { id: where.id };
    return this.db.account.findUnique({ where: lookup, select: safeAccountSelect });
  }
}
