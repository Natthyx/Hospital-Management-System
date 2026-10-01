const { spawnSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function globalSetup() {
  const rootDir = path.resolve(__dirname, '../../../..');

  const migrationUrl =
    process.env.TEST_DATABASE_MIGRATION_URL ||
    process.env.DATABASE_MIGRATION_URL;
  if (!migrationUrl) {
    throw new Error(
      'globalSetup: TEST_DATABASE_MIGRATION_URL is required to run tests.',
    );
  }

  let parsed;
  try {
    parsed = new URL(migrationUrl);
  } catch {
    throw new Error(
      `globalSetup: TEST_DATABASE_MIGRATION_URL is malformed: ${migrationUrl}`,
    );
  }

  if (parsed.pathname !== '/hms_test') {
    throw new Error(
      `globalSetup: TEST_DATABASE_MIGRATION_URL must point to database 'hms_test', got: '${parsed.pathname.replace(/^\//, '')}'`,
    );
  }

  const result = spawnSync(
    'pnpm',
    ['--filter', '@hms/api', 'exec', 'prisma', 'migrate', 'deploy'],
    {
      stdio: 'inherit',
      cwd: rootDir,
      env: {
        ...process.env,
        DATABASE_URL: migrationUrl,
        DATABASE_MIGRATION_URL: migrationUrl,
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
      },
    },
  );

  if (result.status !== 0) {
    throw new Error('globalSetup: prisma migrate deploy failed on hms_test');
  }
};
