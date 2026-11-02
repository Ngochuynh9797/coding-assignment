import type { Config } from 'jest';

const config: Config = {
  rootDir: '..',
  roots: ['<rootDir>/test/e2e'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@infra/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
  },
  // One PostgreSQL container for the whole run; the files share it, hence --runInBand.
  globalSetup: '<rootDir>/test/e2e/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/e2e/setup/global-teardown.ts',
  testTimeout: 60_000,
};

export default config;
