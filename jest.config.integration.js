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

// Export async config to override Next.js default transformIgnorePatterns
const nextJestConfig = createJestConfig(customJestConfig);
const esmAllowList = [
  '@prisma',
  'geist',
  'node-fetch',
  'p-limit',
  'yocto-queue',
  'jsdom',
  'parse5',
  'uuid',
  // AI SDK v7 系は ESM のみ配信のため Jest の変換対象に含める
  'ai',
  '@ai-sdk',
  // @ai-sdk/provider-utils が依存（ESM のみ）
  '@workflow',
];
const esmPattern = esmAllowList.join('|');

module.exports = async () => {
  const config = await nextJestConfig();
  return {
    ...config,
    transformIgnorePatterns: [
      `/node_modules/(?!(?:${esmPattern})/)`,
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
};
