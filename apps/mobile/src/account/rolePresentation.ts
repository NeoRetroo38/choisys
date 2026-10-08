import type { Role } from '@scenarys/shared';
import { roleOrder } from './capabilities';

/** Display guard only: capabilities gate the controls and the server remains authoritative. */
export function isLowerRole(actor: Role | undefined, target: Role): boolean {
  return actor !== undefined && roleOrder.indexOf(target) < roleOrder.indexOf(actor);
}

export function roleChoices(actor: Role | undefined, target: Role): Role[] {
  if (!isLowerRole(actor, target)) return [];
  return roleOrder.filter(role => role !== target && isLowerRole(actor, role));
}
