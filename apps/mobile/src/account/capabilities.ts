/**
 * Navigation model built only from the capability keys the API returns (GET /me → capabilities).
 * The server still enforces every request; this decides what is worth showing, nothing more.
 * Never branch on the role name here: the role is shown to people, capabilities drive behaviour.
 */
export type Capability =
  | 'profile.read.own' | 'profile.update.own' | 'cube_data.read.own' | 'cube_data.create.own'
  | 'cube_data.export.own' | 'account.delete.own' | 'profile.read.any' | 'account.disable'
  | 'role.assign' | 'role_changes.read' | 'cube_data.read.any' | 'cube_data.read.technical' | 'system.manage';

export type Capabilities = ReadonlySet<string>;

export function capabilitySet(keys: readonly string[] | null | undefined): Capabilities {
  return new Set(keys ?? []);
}

/** Every listed capability is needed. */
export function can(capabilities: Capabilities, ...keys: Capability[]): boolean {
  return keys.every(key => capabilities.has(key));
}

export interface NavigationModel {
  play: boolean;
  account: { visible: boolean; history: boolean; rename: boolean; export: boolean; delete: boolean };
  system: { visible: boolean; status: boolean; people: boolean; audit: boolean; assignRole: boolean; disable: boolean };
}

export function navigationModel(capabilities: Capabilities): NavigationModel {
  const account = {
    history: can(capabilities, 'cube_data.read.own'),
    rename: can(capabilities, 'profile.update.own'),
    export: can(capabilities, 'cube_data.export.own'),
    delete: can(capabilities, 'account.delete.own'),
  };
  const system = {
    status: can(capabilities, 'system.manage'),
    people: can(capabilities, 'profile.read.any'),
    audit: can(capabilities, 'role_changes.read'),
    assignRole: can(capabilities, 'profile.read.any', 'role.assign'),
    disable: can(capabilities, 'profile.read.any', 'account.disable'),
  };
  return {
    play: can(capabilities, 'cube_data.create.own'),
    account: { visible: can(capabilities, 'profile.read.own'), ...account },
    system: { visible: system.status || system.people || system.audit, ...system },
  };
}

/** Product name for each internal role (docs/ROLES.md). Display only. */
export const roleLabel: Record<string, string> = {
  USER: 'usuario', ADMIN: 'admin', DEV: 'dev', SUPERADMIN: 'superadmin', SUPERDEV: 'sudev',
};

/** Roles in ascending order, to offer choices. The server still refuses anything not below the actor's own. */
export const roleOrder = ['USER', 'ADMIN', 'DEV', 'SUPERADMIN', 'SUPERDEV'] as const;
