import type { Role } from '@prisma/client';

/**
 * Source of truth for the permission catalogue and the role grants that seed
 * `permissions` and `role_permissions`. Data only: nothing here touches the database yet.
 */
export const permissions = {
  // USER: the person's own data.
  'profile.read.own': 'Read own profile',
  'profile.update.own': 'Update own display name',
  'cube_data.read.own': 'Read own runs and sessions',
  'cube_data.create.own': 'Create own runs and sessions',
  'cube_data.export.own': 'Export own data',
  'account.delete.own': 'Delete own account and its data',
  // SUPERDEV: operate the whole system.
  'profile.read.any': 'Read any profile',
  'account.disable': 'Disable or re-enable any account',
  'role.assign': 'Assign roles below its own',
  'role_changes.read': 'Read the role change audit log',
  'role_requests.read': 'Read role requests',
  'cube_data.read.any': 'Read any profile\'s runs and sessions',
  'cube_data.read.technical': 'Read technical result data and engine versions',
  'system.manage': 'Manage system configuration',
} as const;

export type PermissionKey = keyof typeof permissions;

const userGrants: readonly PermissionKey[] = [
  'profile.read.own', 'profile.update.own', 'cube_data.read.own',
  'cube_data.create.own', 'cube_data.export.own', 'account.delete.own',
];

const superdevExtras: readonly PermissionKey[] = [
  'profile.read.any', 'account.disable', 'role.assign', 'role_changes.read', 'role_requests.read',
  'cube_data.read.any', 'cube_data.read.technical', 'system.manage',
];

/** ADMIN, DEV and SUPERADMIN are reserved: for now they hold exactly what USER holds. */
export const roleGrants: Record<Role, readonly PermissionKey[]> = {
  USER: userGrants,
  ADMIN: userGrants,
  DEV: userGrants,
  SUPERADMIN: userGrants,
  SUPERDEV: [...userGrants, ...superdevExtras],
};

export function roleHasPermission(role: Role, key: PermissionKey): boolean {
  return roleGrants[role].includes(key);
}

export function permissionsFor(role: Role): PermissionKey[] { return [...roleGrants[role]]; }
