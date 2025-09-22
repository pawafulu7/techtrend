// 統合テスト用のJest設定
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.integration.js'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  reporters: ['default'],
  transformIgnorePatterns: [
    'node_modules/(?!(node-fetch|next-auth|@auth)/)',
  ],
  moduleNameMapper: {
    // 統合テストでは実際のPrismaとRedisを使用するため、モックをマッピングしない
    '^@/(.*)$': '<rootDir>/$1',
  },
  moduleDirectories: ['node_modules', '<rootDir>'],
  testMatch: [
    '**/__tests__/integration/**/*.test.ts',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
  ],
  collectCoverageFrom: [
    'scripts/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/*.config.{js,ts}',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
};

module.exports = createJestConfig(customJestConfig);