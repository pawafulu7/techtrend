// DOM/React環境用のJest設定（コンポーネントテスト用）
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.dom.js'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    // CSS modules
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
    '^.+\\.(css|sass|scss)$': '<rootDir>/__mocks__/styleMock.js',
    // Image imports
    '^.+\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
    // Mock Next.js navigation
    '^next/navigation$': '<rootDir>/__tests__/__mocks__/next-navigation.ts',
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/e2e/',
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