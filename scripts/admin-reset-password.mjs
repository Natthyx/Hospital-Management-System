#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

// Load root .env if present
try {
  process.loadEnvFile(path.join(rootDir, '.env'));
} catch {
  // Continue if .env is missing or already loaded
}

const args = process.argv.slice(2);

function printUsage() {
  console.log(`
Usage: pnpm admin:reset-password --username <username> [--force]

Options:
  --username, -u <username>   Username of the account to reset (required)
  --force, -f                 Bypass interactive confirmation / non-TTY check
  --help, -h                  Show this help message
`);
}

if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

let username = '';
let force = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--username' || arg === '-u') {
    username = args[i + 1] ?? '';
    i++;
  } else if (arg.startsWith('--username=')) {
    username = arg.slice('--username='.length);
  } else if (arg === '--force' || arg === '-f') {
    force = true;
  }
}

if (!username) {
  console.error('ERROR: Missing required option --username <username>');
  printUsage();
  process.exit(1);
}

const distPath = path.join(
  rootDir,
  'apps/api/dist/modules/auth/admin-recovery.js',
);

if (!fs.existsSync(distPath)) {
  console.error('Building project before running recovery CLI...');
  const buildResult = spawnSync('pnpm', ['--filter', '@hms/api', 'build'], {
    stdio: 'inherit',
    cwd: rootDir,
    env: process.env,
  });
  if (buildResult.status !== 0) {
    console.error('ERROR: Build failed. Cannot run recovery CLI.');
    process.exit(1);
  }
}

const moduleUrl = pathToFileURL(distPath).href;
const { executeAdminPasswordReset } = await import(moduleUrl);

try {
  const result = await executeAdminPasswordReset({
    username,
    force,
    isTty: Boolean(process.stdin.isTTY),
  });

  // Stderr banner (security alert)
  console.error(`
================================================================================
SECURITY NOTICE: Account password reset via Admin Recovery CLI.
Account: '${result.username}' (User ID: ${result.userId}, Version: ${result.version})
Active sessions have been revoked.
Forced password change is enabled on next login.
================================================================================
`);

  // Stdout: temporary password
  console.log(`TEMPORARY PASSWORD: ${result.temporaryPassword}`);
  process.exit(0);
} catch (error) {
  console.error(
    `ERROR: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
