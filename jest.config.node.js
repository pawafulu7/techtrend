// Node.js環境用のJest設定（API/ユニットテスト用）
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

// 実 PostgreSQL の EmbeddingJob テーブルを共有するテスト群。
//
// embedding-scheduler.test.ts は beforeEach で `embeddingJob.deleteMany()`（全件削除）を行い、
// getStats() / recoverStuckJobs() / getPendingJobs() の件数を DB 全体の絶対値で検証する
// （例: `expect(stats.total).toBe(2)`）。これらのメソッドは絞り込み引数を持たないため、
// テスト側のフィルタでは分離できず、同テーブルを使う他テストとの排他実行が前提になっている。
// 一方 workers/embedding.test.ts は自身が作成したジョブの DB 状態を検証するため、
// 両者を並列実行すると双方向に状態を破壊し合う（確率的な失敗になる）。
//
// そこで通常の並列実行からは除外し、`npm run test:node:serial` で --runInBand 実行する。
// JEST_SERIAL_DB=1 のときのみ本設定の除外を外し、直列側の実行対象にする。
const SERIAL_DB_TEST_PATHS = [
  '<rootDir>/__tests__/api/workers/embedding\\.test\\.ts$',
  '<rootDir>/__tests__/unit/services/embedding-scheduler\\.test\\.ts$',
];
const isSerialDbRun = process.env.JEST_SERIAL_DB === '1';

const customJestConfig = {
  rootDir: './',
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.node.js'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  reporters: [
    'default',
    // CI環境でのみCTRFレポートを生成（Flaky Test検出用）
    ...(process.env.CI
      ? [
          [
            'jest-ctrf-json-reporter',
            {
              // 並列側と直列側で 2 回起動するため、出力先を分けて上書きを防ぐ
              outputFile: isSerialDbRun
                ? 'jest-node-serial-ctrf-report.json'
                : 'jest-node-ctrf-report.json',
              outputDir: 'ctrf',
            },
          ],
        ]
      : []),
  ],
  moduleNameMapper: {
    // Manual mocks for Prisma and Redis (must come before generic alias)
    '^@/lib/prisma$': '<rootDir>/__mocks__/lib/prisma.ts',
    // Order matters: specific create-client mock MUST precede the wildcard
    '^@/lib/prisma/create-client$': '<rootDir>/__mocks__/lib/prisma/create-client.ts',
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
    '^ioredis$': '<rootDir>/__mocks__/ioredis.ts',
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
  testMatch: [
    '**/__tests__/**/*.test.[jt]s',
    '**/__tests__/**/*.node.test.[jt]s',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/e2e/',
    '<rootDir>/e2e/',
    '<rootDir>/__tests__/integration/', // 統合テストは別コマンドで実行
    '\\.test\\.tsx$', // Reactコンポーネントテストは除外
    // DB 共有テストは並列側から除外し、test:node:serial で --runInBand 実行する
    ...(isSerialDbRun ? [] : SERIAL_DB_TEST_PATHS),
  ],
  coverageReporters: ['text', 'lcov', 'json', 'json-summary'],
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

// Export async config to override Next.js default transformIgnorePatterns
const nextJestConfig = createJestConfig(customJestConfig);
const esmAllowList = [
  '@prisma',
  'geist',
  'node-fetch',
  'p-limit',
  'yocto-queue',
  'rate-limiter-flexible',
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
    extensionsToTreatAsEsm: Array.from(
      new Set([...(config.extensionsToTreatAsEsm ?? []), '.ts', '.tsx'])
    ),
    // Keep Next.js default transform (DO NOT override)
    transform: config.transform,
    transformIgnorePatterns: [
      `/node_modules/(?!(?:${esmPattern})/)`,
      ...config.transformIgnorePatterns.filter(
        (pattern) => !pattern.includes('node_modules')
      ),
    ],
  };
};
