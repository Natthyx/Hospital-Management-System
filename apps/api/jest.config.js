/** @type {import('ts-jest').JestConfigWithTsJest} */
const path = require('node:path');

try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch {
  // If .env is missing (e.g. CI where env vars are already in process.env), continue
}

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'mjs'],
  rootDir: '.',
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',

  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@hms/shared$': '<rootDir>/../../packages/shared/src',
  },
};
