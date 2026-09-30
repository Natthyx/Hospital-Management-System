#!/usr/bin/env node
/**
 * prisma.mjs — Wrapper to run Prisma CLI commands with the root .env loaded.
 *
 * Ensures Prisma commands (migrate, studio, etc.) work from the root workspace
 * without needing symlinks to .env in apps/api.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  // If .env is missing (e.g. CI where env vars are already in process.env), continue
}

const args = process.argv.slice(2);

const result = spawnSync(
  'pnpm',
  ['--filter', '@hms/api', 'exec', 'prisma', ...args],
  {
    stdio: 'inherit',
    cwd: rootDir,
    env: {
      ...process.env,
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
  },
);

if (result.error) {
  console.error('Failed to run Prisma:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
