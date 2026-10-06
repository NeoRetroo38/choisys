import type { PrismaClient, Role } from '@prisma/client';
import { permissions, roleGrants, type PermissionKey } from '../permissions.js';

export interface SeedSummary { permissions: number; grants: number }

/**
 * Loads the catalogue and the role grants from src/permissions.ts into `permissions` and
 * `role_permissions`. It is idempotent and convergent: running it again changes nothing, and
 * rows that are no longer in the source of truth are removed.
 */
export async function seedPermissions(db: PrismaClient): Promise<SeedSummary> {
  const keys = Object.keys(permissions) as PermissionKey[];
  const roles = Object.keys(roleGrants) as Role[];
  return db.$transaction(async tx => {
    for (const key of keys) {
      await tx.permission.upsert({ where: { key }, update: { description: permissions[key] }, create: { key, description: permissions[key] } });
    }
    // Permissions that left the catalogue disappear, and their grants cascade with them.
    await tx.permission.deleteMany({ where: { key: { notIn: keys } } });
    const rows = await tx.permission.findMany({ where: { key: { in: keys } }, select: { id: true, key: true } });
    const idByKey = new Map(rows.map(row => [row.key, row.id]));
    let grants = 0;
    for (const role of roles) {
      const granted = roleGrants[role];
      // A role keeps exactly what the source of truth gives it: drop the rest, add what is missing.
      await tx.rolePermission.deleteMany({ where: { role, permission: { key: { notIn: [...granted] } } } });
      await tx.rolePermission.createMany({
        data: granted.map(key => ({ role, permissionId: idByKey.get(key)! })),
        skipDuplicates: true,
      });
      grants += granted.length;
    }
    return { permissions: keys.length, grants };
  });
}
