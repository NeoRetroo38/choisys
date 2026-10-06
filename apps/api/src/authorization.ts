import type { Role } from '@prisma/client';

export interface AuthActor {
  /** Must come from backend authentication, never from a request body. */
  profileId: string;
  role: Role;
}

export interface ProfileScope { id: string; role: Role }
export interface CubeDataScope { profileId: string; profileRole: Role }

const rank: Record<Role, number> = { USER: 0, ADMIN: 1, DEV: 2, SUPERDEV: 3 };

export function canReadProfile(actor: AuthActor, target: ProfileScope): boolean {
  if (actor.profileId === target.id || actor.role === 'SUPERDEV') return true;
  if (actor.role === 'DEV') return target.role !== 'SUPERDEV';
  return actor.role === 'ADMIN' && target.role === 'USER';
}

export function canManageProfile(actor: AuthActor, target: ProfileScope): boolean {
  if (actor.profileId === target.id) return false;
  return rank[actor.role] > rank[target.role];
}

export function canAssignRole(actor: AuthActor, role: Role): boolean {
  return rank[actor.role] > rank[role];
}

export function canReadCubeData(actor: AuthActor, data: CubeDataScope): boolean {
  return canReadProfile(actor, { id: data.profileId, role: data.profileRole });
}

export function canWriteCubeData(actor: AuthActor, owner: ProfileScope): boolean {
  return actor.profileId === owner.id || canManageProfile(actor, owner);
}

export function canAccessTechnicalData(actor: AuthActor): boolean {
  return actor.role === 'DEV' || actor.role === 'SUPERDEV';
}

export function canManageSystem(actor: AuthActor): boolean {
  return actor.role === 'SUPERDEV';
}
