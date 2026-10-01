#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const cliPath = path.join(rootDir, 'apps/api/dist/database/seeds/cli.js');

if (!fs.existsSync(cliPath)) {
  console.error('ERROR: Seed CLI not found. Run pnpm build first.');
  process.exit(1);
}

// Load root .env if present
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  // Continue if .env is missing or already loaded
}

const result = spawnSync('node', [cliPath], {
  stdio: 'inherit',
  cwd: rootDir,
  env: process.env,
});

process.exit(result.status ?? 1);
