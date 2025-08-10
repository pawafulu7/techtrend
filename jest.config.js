const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  // setupFiles: ['<rootDir>/__tests__/helpers/setup.ts'], // 一時的にコメントアウト
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'node',
  moduleNameMapper: {
    // Manual mocks for Prisma and Redis (must come before generic alias)
    '^@/lib/prisma$': '<rootDir>/__mocks__/lib/prisma.ts',
    '^@/lib/redis/client$': '<rootDir>/__mocks__/lib/redis/client.ts',
    // Mock Next.js navigation
    '^next/navigation$': '<rootDir>/__tests__/__mocks__/next-navigation.ts',
    // Mock ioredis
    '^ioredis$': '<rootDir>/__tests__/__mocks__/ioredis.ts',
    // Handle module aliases (must be last due to wildcard)
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/e2e/',  // Playwright E2Eテストを除外
  ],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'types/**/*.{js,jsx,ts,tsx}',
    '!app/**/*.d.ts',
    '!lib/**/*.d.ts',
    '!types/**/*.d.ts',
    '!**/*.config.js',
    '!**/*.config.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 20,
      lines: 20,
      statements: 20,
    },
  },
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageDirectory: 'coverage',
  testMatch: [
    '**/__tests__/**/*.test.{js,jsx,ts,tsx}',
    '**/?(*.)+(spec|test).{js,jsx,ts,tsx}',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);