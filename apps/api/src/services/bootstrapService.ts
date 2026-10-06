import type { PrismaClient } from '@prisma/client';
import { PersistenceInputError, PersistenceNotFoundError } from '../persistenceErrors.js';
import { normalizeEmail } from './accountService.js';

/** Raised when the one-time bootstrap has already been done. */
export class BootstrapConflictError extends Error {
  readonly code = 'BOOTSTRAP_ALREADY_DONE';
}

const maxReasonLength = 240;

/**
 * One-time local procedure that promotes an existing account to SUPERDEV and records it in
 * `role_changes` with a NULL actor. It is not reachable over HTTP and accepts no role from a client.
 * Serializable isolation stops two concurrent runs from both succeeding.
 */
export async function bootstrapSuperdev(db: PrismaClient, email: string, reason = 'initial SUPERDEV bootstrap') {
  const normalized = normalizeEmail(email);
  const note = reason.trim();
  if (note.length < 1 || note.length > maxReasonLength) throw new PersistenceInputError('Invalid reason.');
  return db.$transaction(async tx => {
    if (await tx.profile.count({ where: { role: 'SUPERDEV' } }) > 0) {
      throw new BootstrapConflictError('A SUPERDEV already exists; bootstrap is single use.');
    }
    const account = await tx.account.findUnique({
      where: { email: normalized },
      select: { isActive: true, profile: { select: { id: true, role: true } } },
    });
    if (!account?.profile) throw new PersistenceNotFoundError('Account not found.');
    if (!account.isActive) throw new PersistenceInputError('Account is disabled.');
    const profile = await tx.profile.update({
      where: { id: account.profile.id },
      data: { role: 'SUPERDEV' },
      select: { id: true, role: true, displayName: true },
    });
    await tx.roleChange.create({
      data: { targetProfileId: profile.id, actorProfileId: null, fromRole: account.profile.role, toRole: 'SUPERDEV', reason: note },
    });
    return profile;
  }, { isolationLevel: 'Serializable' });
}
