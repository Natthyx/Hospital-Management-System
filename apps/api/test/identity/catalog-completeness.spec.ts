import { PERMISSIONS } from '@hms/shared';
import { PrismaClient } from '@prisma/client';

import { cleanTestDatabase } from '../utils/test-cleaner';

describe('Catalog Completeness & Admin Role Completeness', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    await cleanTestDatabase();
    prisma = new PrismaClient(
      process.env.DATABASE_URL
        ? { datasources: { db: { url: process.env.DATABASE_URL } } }
        : undefined,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('guarantees that database permissions table matches the PERMISSIONS catalog exactly', async () => {
    const dbPermissions = await prisma.permission.findMany({
      orderBy: { code: 'asc' },
    });

    const catalogSorted = [...PERMISSIONS].sort((a, b) =>
      a.code.localeCompare(b.code),
    );

    expect(dbPermissions.length).toBe(catalogSorted.length);

    for (let i = 0; i < catalogSorted.length; i++) {
      const cat = catalogSorted[i];
      const db = dbPermissions[i];
      expect(cat).toBeDefined();
      expect(db).toBeDefined();
      if (cat && db) {
        expect(db.code).toBe(cat.code);
        expect(db.module).toBe(cat.module);
        expect(db.description).toBe(cat.description);
      }
    }
  });

  it('guarantees complete admin role permissions via user_roles -> role_permissions -> permissions', async () => {
    // 1. Look up user 'admin'
    const adminUser = await prisma.user.findUniqueOrThrow({
      where: { username: 'admin' },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(adminUser).toBeDefined();
    expect(adminUser.userRoles.length).toBeGreaterThanOrEqual(1);

    // 2. Extract all permission codes assigned to admin
    const assignedCodes = new Set<string>();
    for (const ur of adminUser.userRoles) {
      for (const rp of ur.role.rolePermissions) {
        assignedCodes.add(rp.permissionCode);
      }
    }

    // 3. Assert all 11 catalog permissions are assigned to the admin user
    for (const cat of PERMISSIONS) {
      expect(assignedCodes.has(cat.code)).toBe(true);
    }
  });
});
