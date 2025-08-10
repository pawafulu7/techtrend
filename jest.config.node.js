// Node.js環境用のJest設定（API/ユニットテスト用）
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.node.js'],
  testEnvironment: 'node',
  moduleNameMapper: {
    // Manual mocks for Prisma and Redis (must come before generic alias)
    '^@/lib/database$': '<rootDir>/__mocks__/lib/database.ts',
    '^@/lib/database/index$': '<rootDir>/__mocks__/lib/database.ts',
    '^@/lib/redis/client$': '<rootDir>/__mocks__/lib/redis/client.ts',
    // Mock Next.js modules
    '^next/server$': '<rootDir>/__mocks__/next/server.ts',
    '^next/navigation$': '<rootDir>/__tests__/__mocks__/next-navigation.ts',
    // Mock ioredis
    '^ioredis$': '<rootDir>/__tests__/__mocks__/ioredis.ts',
    // Handle module aliases (must be last due to wildcard)
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/e2e/',
  ],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '!**/__tests__/**/*.test.tsx', // Reactコンポーネントテストは除外
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!app/**/*.tsx', // ReactコンポーネントはNode環境では除外
    '!**/*.d.ts',
    '!**/*.config.{js,ts}',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
};

module.exports = createJestConfig(customJestConfig);