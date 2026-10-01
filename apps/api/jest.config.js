/** @type {import('ts-jest').JestConfigWithTsJest} */
const path = require('node:path');

const envPath =
  process.env.HMS_ENV_PATH || path.resolve(__dirname, '../../.env');
try {
  process.loadEnvFile(envPath);
} catch {
  // If .env is missing (e.g. CI where env vars are already in process.env), continue
}

// Condition 1 & 2: Test database safety checks
// Tests must only ever run against hms_test.
// TEST_DATABASE_URL and TEST_DATABASE_MIGRATION_URL are required and must point to hms_test.
const testDbUrl = process.env.TEST_DATABASE_URL;
const testMigrationUrl = process.env.TEST_DATABASE_MIGRATION_URL;

if (!testDbUrl) {
  throw new Error(
    'Jest safety check failed: TEST_DATABASE_URL is required to run tests. Set it to a postgresql connection string for database hms_test.',
  );
}

if (!testMigrationUrl) {
  throw new Error(
    'Jest safety check failed: TEST_DATABASE_MIGRATION_URL is required to run tests. Set it to a postgresql connection string for database hms_test.',
  );
}

let parsedDbUrl;
try {
  parsedDbUrl = new URL(testDbUrl);
} catch {
  throw new Error(
    `Jest safety check failed: TEST_DATABASE_URL is malformed: ${testDbUrl}`,
  );
}

if (parsedDbUrl.pathname !== '/hms_test') {
  throw new Error(
    `Jest safety check failed: TEST_DATABASE_URL must point to database 'hms_test', got '${parsedDbUrl.pathname.replace(/^\//, '')}'`,
  );
}

let parsedMigrationUrl;
try {
  parsedMigrationUrl = new URL(testMigrationUrl);
} catch {
  throw new Error(
    `Jest safety check failed: TEST_DATABASE_MIGRATION_URL is malformed: ${testMigrationUrl}`,
  );
}

if (parsedMigrationUrl.pathname !== '/hms_test') {
  throw new Error(
    `Jest safety check failed: TEST_DATABASE_MIGRATION_URL must point to database 'hms_test', got '${parsedMigrationUrl.pathname.replace(/^\//, '')}'`,
  );
}

// Map onto DATABASE_URL and DATABASE_MIGRATION_URL inside the test process only
process.env.DATABASE_URL = testDbUrl;
process.env.DATABASE_MIGRATION_URL = testMigrationUrl;

// DB suites stay --runInBand because the test cleaner uses TRUNCATE ... CASCADE across shared tables
module.exports = {
  globalSetup: '<rootDir>/test/setup/global-setup.js',
  moduleFileExtensions: ['js', 'json', 'ts', 'mjs', 'mts'],
  rootDir: '.',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',

  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
    '^.+\\.mts$': '<rootDir>/test/mts-transformer.js',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@hms/shared$': '<rootDir>/../../packages/shared/src',
    '^(.*)\\.mjs$': '$1.mts',
  },
};
