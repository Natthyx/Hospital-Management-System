#!/usr/bin/env node
/**
 * db-reset.mjs — Drop and recreate the development database.
 *
 * Safety guards (enforced via validateDbResetEnv):
 *   - Refuses to run unless NODE_ENV=development
 *   - Refuses to run unless DATABASE_MIGRATION_URL host is localhost, 127.0.0.1, or ::1
 *   - Refuses to run unless database name is in allow-list (hms_dev, hms_test)
 *   - Refuses to run if SHADOW_DATABASE_URL host is remote
 *
 * Steps:
 *   1. Validate environment
 *   2. Run prisma migrate reset --force (drops, re-migrates, skips seeds)
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateDbResetEnv } from './db-reset-guard.ts';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

// Load .env if present
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  // If .env is missing or already loaded, continue
}

const validation = validateDbResetEnv(process.env);
if (!validation.ok) {
  console.error(
    `\n[SECURITY GUARD ERROR] Database reset refused: ${validation.error}\n`,
  );
  process.exit(1);
}

console.log('Resetting development database...');
console.log(
  'Note: if you also need to recreate Docker volumes, run:\n' +
    '  pnpm db:down && docker compose -f docker/docker-compose.yml down -v && pnpm db:up\n',
);

const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@hms/api',
    'exec',
    'prisma',
    'migrate',
    'reset',
    '--force',
    '--skip-seed',
  ],
  {
    stdio: 'inherit',
    cwd: rootDir,
    env: {
      ...process.env,
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
  },
);

if (result.status !== 0) {
  console.error('\nDatabase reset failed.');
  process.exit(result.status ?? 1);
}

console.log('\nDatabase reset complete.');
