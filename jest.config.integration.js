// 統合テスト用のJest設定
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  displayName: 'Integration Tests',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/integration/**/*.test.ts',
    '**/__tests__/integration/**/*.test.tsx',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/components/(.*)$': '<rootDir>/components/$1',
    // Manual mocks for integration tests as well
    '^@/lib/database$': '<rootDir>/__mocks__/lib/database.ts',
    '^@/lib/redis/client$': '<rootDir>/__mocks__/lib/redis/client.ts',
    '^next/navigation$': '<rootDir>/__mocks__/next/navigation.ts',
    '^ioredis$': '<rootDir>/__mocks__/ioredis.ts',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  coverageDirectory: '<rootDir>/coverage/integration',
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/__mocks__/**',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.integration.js'],
  testTimeout: 30000, // 統合テストは時間がかかるため30秒に設定
  maxWorkers: 1, // 統合テストは順次実行
  bail: false, // エラーがあっても全テスト実行
  verbose: true, // 詳細な出力
  // 統合テストではモックを使わない
  clearMocks: false,
  resetMocks: false,
  restoreMocks: false,
};

module.exports = createJestConfig(customJestConfig);
