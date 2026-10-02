import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  findWorkspaceRoot,
  loadRootEnv,
  type LoadRootEnvOptions,
} from '../src/config/env.schema';

describe('Root .env Auto-Loader & Workspace Root Resolution (CI-safe)', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const compiledConfigDir = path.resolve(__dirname, '../dist/config');
  let fixtureDir: string;

  beforeAll(() => {
    // Create an isolated temporary fixture monorepo tree
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hms-env-fixture-'));

    // Create root files
    fs.writeFileSync(
      path.join(fixtureDir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    );
    fs.writeFileSync(
      path.join(fixtureDir, '.env'),
      [
        '# Fixture environment',
        'FIXTURE_DATABASE_URL=postgresql://fixture:pass@localhost:5432/hms_fixture',
        'FIXTURE_SHARED_KEY=from_fixture_file',
        'FIXTURE_EXISTING_KEY=overridden_value',
        'FIXTURE_PROD_KEY=should_not_load_in_prod',
      ].join('\n'),
    );

    // Create nested app directory structures matching real project
    fs.mkdirSync(path.join(fixtureDir, 'apps/api/dist/config'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(fixtureDir, 'apps/api/src/config'), {
      recursive: true,
    });
  });

  afterAll(() => {
    // Clean up temporary fixture directory
    if (fixtureDir && fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  describe('Real compiled location (apps/api/dist/config)', () => {
    it('calls findWorkspaceRoot from real compiled output and resolves monorepo root, not apps/', () => {
      // Import directly from the real compiled JavaScript artifact
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const compiled = require('../dist/config/env.schema') as {
        findWorkspaceRoot: (
          startDir?: string,
          fallbackDir?: string,
        ) => string | null;
        loadRootEnv: (options?: LoadRootEnvOptions) => boolean;
      };

      const resolvedFromCompiled =
        compiled.findWorkspaceRoot(compiledConfigDir);

      // Must find real repository root containing pnpm-workspace.yaml
      expect(resolvedFromCompiled).toBe(repoRoot);
      // Buggy resolution path.resolve(__dirname, '../../..') gives apps/
      expect(resolvedFromCompiled).not.toBe(path.join(repoRoot, 'apps'));
      expect(resolvedFromCompiled).not.toBe(path.join(repoRoot, 'apps/api'));
    });

    it('proves path.resolve(__dirname, "../../..") from compiled config gives apps/ instead of workspace root', () => {
      const buggyPath = path.resolve(compiledConfigDir, '../../..');
      const correctRoot = findWorkspaceRoot(compiledConfigDir);

      expect(buggyPath).toBe(path.join(repoRoot, 'apps'));
      expect(correctRoot).toBe(repoRoot);
      expect(correctRoot).not.toBe(buggyPath);
    });
  });

  describe('Temporary fixture tree (isolated from developer .env and CI-safe)', () => {
    it('resolves monorepo root correctly when called from simulated dist/config directory', () => {
      const simulatedDist = path.join(fixtureDir, 'apps/api/dist/config');
      const resolved = findWorkspaceRoot(simulatedDist);

      expect(resolved).toBe(fixtureDir);
      // Proves bug: path.resolve 3 levels up gives apps/
      const buggyDistResolution = path.resolve(simulatedDist, '../../..');
      expect(buggyDistResolution).toBe(path.join(fixtureDir, 'apps'));
      expect(resolved).not.toBe(buggyDistResolution);
    });

    it('resolves monorepo root correctly when called from simulated src/config directory', () => {
      const simulatedSrc = path.join(fixtureDir, 'apps/api/src/config');
      const resolved = findWorkspaceRoot(simulatedSrc);

      expect(resolved).toBe(fixtureDir);
    });

    it('loads variables from fixture .env into process.env', () => {
      delete process.env.FIXTURE_DATABASE_URL;
      delete process.env.FIXTURE_SHARED_KEY;

      const loaded = loadRootEnv({ rootDir: fixtureDir });
      expect(loaded).toBe(true);
      expect(process.env.FIXTURE_DATABASE_URL).toBe(
        'postgresql://fixture:pass@localhost:5432/hms_fixture',
      );
      expect(process.env.FIXTURE_SHARED_KEY).toBe('from_fixture_file');
    });

    it('never overrides existing environment variables in process.env', () => {
      process.env.FIXTURE_EXISTING_KEY = 'pre_existing_value';

      loadRootEnv({ rootDir: fixtureDir });
      expect(process.env.FIXTURE_EXISTING_KEY).toBe('pre_existing_value');
    });

    it('strictly refuses to load in production even if enabled: true', () => {
      delete process.env.FIXTURE_PROD_KEY;

      const loaded = loadRootEnv({
        rootDir: fixtureDir,
        nodeEnv: 'production',
        enabled: true,
      });

      expect(loaded).toBe(false);
      expect(process.env.FIXTURE_PROD_KEY).toBeUndefined();
    });

    it('skips loading when enabled: false option is passed', () => {
      delete process.env.FIXTURE_NEW_KEY;
      fs.appendFileSync(
        path.join(fixtureDir, '.env'),
        '\nFIXTURE_NEW_KEY=some_val\n',
      );

      const loaded = loadRootEnv({
        rootDir: fixtureDir,
        enabled: false,
      });

      expect(loaded).toBe(false);
      expect(process.env.FIXTURE_NEW_KEY).toBeUndefined();
    });

    it('returns null when no pnpm-workspace.yaml exists in directory ancestry', () => {
      const isolatedDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'hms-isolated-'),
      );
      try {
        const result = findWorkspaceRoot(isolatedDir, isolatedDir);
        expect(result).toBeNull();
      } finally {
        fs.rmSync(isolatedDir, { recursive: true, force: true });
      }
    });
  });
});
