const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// API tests specific configuration with jsdom environment for MSW
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.api.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // Handle module aliases
    '^@/(.*)$': '<rootDir>/$1',
    // Mock ioredis
    '^ioredis$': '<rootDir>/__tests__/__mocks__/ioredis.ts',
  },
  testMatch: [
    '**/__tests__/api/**/*.test.{js,jsx,ts,tsx}',
    '**/__tests__/msw/**/*.test.{js,jsx,ts,tsx}',
  ],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
  ],
  collectCoverageFrom: [
    'app/api/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);