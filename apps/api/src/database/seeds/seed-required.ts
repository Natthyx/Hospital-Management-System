import { PERMISSIONS } from '@hms/shared';
import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

import { generateSeedPassword } from './seed-password';

export interface SeedRequiredResult {
  createdAdmin: boolean;
  generatedPassword: string | null;
}

export interface SeedRequiredOptions {
  customPassword?: string;
  adminUsername?: string;
  adminFullName?: string;
}

export const DEFAULT_SYSTEM_ROLES = [
  {
    code: 'admin',
    name: 'Administrator',
    description: 'System administrator with full permissions',
  },
  {
    code: 'receptionist',
    name: 'Receptionist',
    description: 'Front desk patient registration and appointments',
  },
  {
    code: 'nurse',
    name: 'Nurse',
    description: 'Clinical nursing and patient vitals',
  },
  {
    code: 'doctor',
    name: 'Doctor',
    description: 'Consultations, diagnoses, and prescriptions',
  },
  {
    code: 'pharmacist',
    name: 'Pharmacist',
    description: 'Pharmacy dispensing and inventory',
  },
  {
    code: 'lab_technician',
    name: 'Lab Technician',
    description: 'Laboratory specimen processing and results',
  },
  {
    code: 'cashier',
    name: 'Cashier',
    description: 'Billing and payments',
  },
] as const;

/**
 * Executes the required foundation seed.
 * Designed to run as least-privilege role hms_app.
 *
 * Invariants:
 * 1. Admin user and admin role assignment are created in ONE atomic transaction.
 * 2. Missing catalog permissions are added to the admin role; existing permissions are NEVER removed.
 * 3. Default roles are created if missing; existing role names/descriptions are NEVER overwritten.
 * 4. Permissions are upserted from the catalog; orphaned database permissions are reported, NEVER deleted.
 * 5. Returns the generated password; NEVER prints to stdout (printing is isolated to the CLI wrapper).
 */
export async function seedRequired(
  prisma: PrismaClient,
  options: SeedRequiredOptions = {},
): Promise<SeedRequiredResult> {
  // 1. Sync permissions from catalog
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { description: perm.description },
      create: {
        code: perm.code,
        module: perm.module,
        description: perm.description,
      },
    });
  }

  // Check for orphaned permissions in database (never delete them)
  const dbPermissions = await prisma.permission.findMany({
    select: { code: true },
  });
  const catalogCodes = new Set<string>(PERMISSIONS.map((p) => p.code));
  const orphans = dbPermissions.filter((p) => !catalogCodes.has(p.code));
  if (orphans.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[SEED WARNING] Orphaned permissions found in database: ${orphans.map((o) => o.code).join(', ')}`,
    );
  }

  // 2. Ensure default system roles exist (never overwrite names or descriptions)
  for (const roleDef of DEFAULT_SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({
      where: { code: roleDef.code },
    });
    if (!existing) {
      await prisma.role.create({
        data: {
          code: roleDef.code,
          name: roleDef.name,
          description: roleDef.description,
          isSystem: true,
        },
      });
    }
  }

  // 3. Ensure admin role has all foundation permissions (never remove permissions)
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: 'admin' },
  });

  const existingAdminRolePerms = await prisma.rolePermission.findMany({
    where: { roleId: adminRole.id },
    select: { permissionCode: true },
  });
  const currentAdminPermCodes = new Set(
    existingAdminRolePerms.map((rp) => rp.permissionCode),
  );

  for (const perm of PERMISSIONS) {
    if (!currentAdminPermCodes.has(perm.code)) {
      await prisma.rolePermission.create({
        data: {
          roleId: adminRole.id,
          permissionCode: perm.code,
        },
      });
    }
  }

  // 4. Ensure first admin user exists
  const adminUsername = options.adminUsername ?? 'admin';
  const existingAdminUser = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (existingAdminUser) {
    return {
      createdAdmin: false,
      generatedPassword: null,
    };
  }

  // Generate password and hash with Argon2id
  const password = options.customPassword ?? generateSeedPassword(24);

  const isTest = process.env.NODE_ENV === 'test';
  const memoryCost =
    Number(process.env.ARGON2_MEMORY) || (isTest ? 1024 : 65536);
  const timeCost = Number(process.env.ARGON2_ITERATIONS) || (isTest ? 1 : 3);
  const parallelism =
    Number(process.env.ARGON2_PARALLELISM) || (isTest ? 1 : 4);

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost,
    timeCost,
    parallelism,
  });

  // Create admin user and assign admin role in ONE atomic transaction
  await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        username: adminUsername,
        fullName: options.adminFullName ?? 'System Administrator',
        passwordHash,
        status: 'active',
        mustChangePassword: true,
      },
    });

    await tx.userRole.create({
      data: {
        userId: newUser.id,
        roleId: adminRole.id,
      },
    });
  });

  return {
    createdAdmin: true,
    generatedPassword: password,
  };
}
