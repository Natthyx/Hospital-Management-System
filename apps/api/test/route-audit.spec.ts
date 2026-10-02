import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import {
  IS_PUBLIC_KEY,
  IS_AUTHENTICATED_KEY,
  PERMISSIONS_KEY,
} from '../src/common';

describe('Route Security Audit (Spec C.c & Rule 04)', () => {
  let moduleRef: TestingModule;
  let modulesContainer: ModulesContainer;
  let metadataScanner: MetadataScanner;
  let reflector: Reflector;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3004';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://hms_app:dev_app_pass@localhost:5432/hms_test';
    process.env.DATABASE_MIGRATION_URL =
      process.env.DATABASE_MIGRATION_URL ??
      'postgresql://hms_owner:dev_owner_pass@localhost:5432/hms_test';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    modulesContainer = moduleRef.get(ModulesContainer);
    metadataScanner = new MetadataScanner();
    reflector = new Reflector();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('every registered route declares either @Public() or @RequirePermission(...)', () => {
    const auditedRoutes: {
      controller: string;
      method: string;
      routePath: string;
      isPublic: boolean;
      isAuthenticated: boolean;
      permissions: string[];
    }[] = [];

    for (const [, moduleInstance] of modulesContainer) {
      for (const [, controllerWrapper] of moduleInstance.controllers) {
        const controllerClass = controllerWrapper.metatype;
        const instance = controllerWrapper.instance as
          Record<string, unknown> | undefined;

        if (!controllerClass || !instance) {
          continue;
        }

        const isClassPublic = Boolean(
          reflector.get<boolean | undefined>(IS_PUBLIC_KEY, controllerClass),
        );
        const classPerms: string[] = [];
        const rawClassPerms: unknown = reflector.get(
          PERMISSIONS_KEY,
          controllerClass,
        );
        if (Array.isArray(rawClassPerms)) {
          for (const item of rawClassPerms) {
            if (typeof item === 'string') {
              classPerms.push(item);
            }
          }
        }

        const prototype = Object.getPrototypeOf(instance) as Record<
          string,
          unknown
        >;
        const methodNames = metadataScanner.getAllMethodNames(prototype);

        for (const methodName of methodNames) {
          const handler = prototype[methodName];
          if (typeof handler !== 'function') {
            continue;
          }

          const hasPath = Reflect.hasMetadata(PATH_METADATA, handler);
          const hasMethod = Reflect.hasMetadata(METHOD_METADATA, handler);

          // Only audit HTTP endpoints
          if (!hasPath || !hasMethod) {
            continue;
          }

          const isMethodPublic = Boolean(
            reflector.get<boolean | undefined>(IS_PUBLIC_KEY, handler),
          );
          const isClassAuthenticated = Boolean(
            reflector.get<boolean | undefined>(
              IS_AUTHENTICATED_KEY,
              controllerClass,
            ),
          );
          const isMethodAuthenticated = Boolean(
            reflector.get<boolean | undefined>(IS_AUTHENTICATED_KEY, handler),
          );
          const methodPerms: string[] = [];
          const rawMethodPerms: unknown = reflector.get(
            PERMISSIONS_KEY,
            handler,
          );
          if (Array.isArray(rawMethodPerms)) {
            for (const item of rawMethodPerms) {
              if (typeof item === 'string') {
                methodPerms.push(item);
              }
            }
          }

          const isPublic = isClassPublic || isMethodPublic;
          const isAuthenticated = isClassAuthenticated || isMethodAuthenticated;
          const permissions: string[] = [...classPerms, ...methodPerms];

          auditedRoutes.push({
            controller: controllerClass.name,
            method: methodName,
            routePath: String(Reflect.getMetadata(PATH_METADATA, handler)),
            isPublic,
            isAuthenticated,
            permissions,
          });
        }
      }
    }

    // Verify routes were actually discovered and audited
    expect(auditedRoutes.length).toBeGreaterThan(0);

    // Fail if ANY route lacks @Public(), @Authenticated(), or @RequirePermission(...)
    for (const route of auditedRoutes) {
      const hasAccessDeclaration =
        route.isPublic || route.isAuthenticated || route.permissions.length > 0;
      expect({
        route: `${route.controller}.${route.method}`,
        hasAccessDeclaration,
      }).toEqual({
        route: `${route.controller}.${route.method}`,
        hasAccessDeclaration: true,
      });
    }
  });
});
