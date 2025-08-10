// 統合テスト用のJest設定
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  displayName: 'integration',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.integration.js'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/e2e/',
  ],
  testMatch: [
    '**/__tests__/integration/**/*.test.ts',
    '**/__tests__/integration/**/*.test.tsx',
  ],
  // 統合テストではモックを使わない
  clearMocks: false,
  resetMocks: false,
  restoreMocks: false,
};

module.exports = createJestConfig(customJestConfig);