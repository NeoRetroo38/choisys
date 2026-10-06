import type { Role, PrismaClient } from '@prisma/client';
import type { AuthActor } from '../authorization.js';
import { canAssignRole, canManageProfile, canReadProfile } from '../authorization.js';
import { AccessDeniedError, PersistenceNotFoundError } from '../persistenceErrors.js';
import { assertDisplayName } from './accountService.js';

const profileSelect = {
  id: true, accountId: true, role: true, displayName: true, createdAt: true, updatedAt: true,
} as const;

export class ProfileService {
  constructor(private readonly db: PrismaClient) {}

  /** Reserved for controlled imports or recovery; normal signup uses AccountService.createAccount. */
  createProfile(actor: AuthActor, input: { accountId: string; displayName: string; role?: Role }) {
    const role = input.role ?? 'USER';
    if (!canAssignRole(actor, role)) throw new AccessDeniedError('Profile creation denied.');
    return this.db.profile.create({
      data: { accountId: input.accountId, displayName: assertDisplayName(input.displayName), role },
      select: profileSelect,
    });
  }

  async getProfile(actor: AuthActor, profileId: string) {
    const profile = await this.db.profile.findUnique({ where: { id: profileId }, select: profileSelect });
    if (!profile) throw new PersistenceNotFoundError('Profile not found.');
    if (!canReadProfile(actor, profile)) throw new AccessDeniedError('Profile access denied.');
    return profile;
  }

  async updateProfileRole(actor: AuthActor, profileId: string, role: Role) {
    const target = await this.db.profile.findUnique({ where: { id: profileId }, select: { id: true, role: true } });
    if (!target) throw new PersistenceNotFoundError('Profile not found.');
    if (!canManageProfile(actor, target) || !canAssignRole(actor, role)) {
      throw new AccessDeniedError('Role change denied.');
    }
    return this.db.profile.update({ where: { id: profileId }, data: { role }, select: profileSelect });
  }

}
