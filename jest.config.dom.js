// DOM/React環境用のJest設定（コンポーネントテスト用）
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.dom.js'],
  testEnvironment: 'jsdom',
  reporters: ['summary'],
  moduleNameMapper: {
    // CSS modules
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
    // Image imports
    '^.+\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
    // Mock Next.js modules
    '^next/navigation$': '<rootDir>/__mocks__/next/navigation.ts',
    '^next/image$': '<rootDir>/__mocks__/next/image.tsx',
    '^next/link$': '<rootDir>/__mocks__/next/link.tsx',
    // Mock next-auth
    '^next-auth/react$': '<rootDir>/__mocks__/next-auth/react.ts',
    '^next-auth$': '<rootDir>/__mocks__/next-auth/index.ts',
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/$1',
    // Mock Prisma client
    '^@/lib/database$': '<rootDir>/__mocks__/lib/database.ts',
    '^@/lib/redis/client$': '<rootDir>/__mocks__/lib/redis/client.ts',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/e2e/',
    '<rootDir>/e2e/',
    // FavoriteButtonテストはNode環境専用なのでDOM環境では除外
    '<rootDir>/components/article/__tests__/FavoriteButton.test.tsx',
  ],
  testMatch: [
    '**/__tests__/**/*.test.tsx',
    '**/tests/**/*.test.tsx',
    '!**/__tests__/**/*.test.ts', // TypeScriptのみのテストは除外
  ],
  collectCoverageFrom: [
    'app/**/*.tsx',
    'components/**/*.tsx',
    '!**/*.d.ts',
    '!**/*.config.{js,ts}',
    '!**/node_modules/**',
    '!**/__tests__/**',
  ],
};

module.exports = createJestConfig(customJestConfig);
