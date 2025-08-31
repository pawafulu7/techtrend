// Node.js環境用のJest設定（API/ユニットテスト用）
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.node.js'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  reporters: ['summary'],
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|next-auth|@auth)/)',
  ],
  moduleNameMapper: {
    // Manual mocks for Prisma and Redis (must come before generic alias)
    '^@/lib/prisma$': '<rootDir>/__mocks__/lib/prisma.ts',
    '^@/lib/prisma/(.*)$': '<rootDir>/__mocks__/lib/prisma.ts',
    '^@/lib/database$': '<rootDir>/__mocks__/lib/database.ts',
    '^@/lib/redis/client$': '<rootDir>/__mocks__/lib/redis/client.ts',
    '^@/lib/redis/factory$': '<rootDir>/__mocks__/lib/redis/factory.ts',
    '^@/lib/cache/redis-cache$': '<rootDir>/__mocks__/lib/cache/redis-cache.ts',
    '^@/lib/cache/source-cache$': '<rootDir>/__mocks__/lib/cache/source-cache.ts',
    // Mock Next.js modules
    '^next/server$': '<rootDir>/__mocks__/next/server.ts',
    '^next/navigation$': '<rootDir>/__tests__/__mocks__/next-navigation.ts',
    // Mock ioredis
    '^ioredis$': '<rootDir>/__tests__/__mocks__/ioredis.ts',
    // Mock node-fetch
    '^node-fetch$': '<rootDir>/__tests__/__mocks__/node-fetch.ts',
    // Explicit helpers mapping for __tests__
    '^@/__tests__/helpers/(.*)$': '<rootDir>/__tests__/helpers/$1',
    '^@/__tests__/api/(.*)$': '<rootDir>/__tests__/api/$1',
    '^@/__tests__/(.*)$': '<rootDir>/__tests__/$1',
    // Handle module aliases (must be last due to wildcard)
    '^@/(.*)$': '<rootDir>/$1',
  },
  moduleDirectories: ['node_modules', '<rootDir>', '<rootDir>/__tests__'],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/e2e/',
    '<rootDir>/e2e/',
    '<rootDir>/__tests__/integration/', // 統合テストは別コマンドで実行
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
