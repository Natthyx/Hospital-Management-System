/**
 * identity/index.ts
 *
 * Single source of truth for identity regex patterns, status enum,
 * and the foundation permission catalog.
 */

export const ROLE_CODE_PATTERN = '^[a-z][a-z0-9_]{1,49}$';
export const ROLE_CODE_REGEX = new RegExp(ROLE_CODE_PATTERN);

export const PERMISSION_CODE_PATTERN = '^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$';
export const PERMISSION_CODE_REGEX = new RegExp(PERMISSION_CODE_PATTERN);

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface PermissionDefinition {
  readonly code: string;
  readonly module: string;
  readonly description: string;
}

export const PERMISSIONS = [
  {
    code: 'users.read',
    module: 'users',
    description: 'List and view user accounts',
  },
  {
    code: 'users.create',
    module: 'users',
    description: 'Create new user accounts',
  },
  {
    code: 'users.update',
    module: 'users',
    description: 'Edit existing user details',
  },
  {
    code: 'users.disable',
    module: 'users',
    description: 'Disable or re-enable user accounts',
  },
  {
    code: 'users.reset_password',
    module: 'users',
    description: 'Reset passwords and unlock locked accounts',
  },
  {
    code: 'users.manage_roles',
    module: 'users',
    description: 'Assign or remove roles for users',
  },
  {
    code: 'roles.read',
    module: 'roles',
    description: 'View roles and their assigned permissions',
  },
  {
    code: 'roles.manage',
    module: 'roles',
    description: 'Create and edit custom roles and permissions',
  },
  {
    code: 'audit.read',
    module: 'audit',
    description: 'View the system audit log',
  },
  {
    code: 'sessions.read_any',
    module: 'sessions',
    description: 'View active sessions for any user',
  },
  {
    code: 'sessions.revoke_any',
    module: 'sessions',
    description: 'Revoke active sessions for any user',
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];
