const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest for React components
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jsdom',  // React components need jsdom
  moduleNameMapper: {
    // Manual mocks (must come before generic alias)
    '^@/lib/database$': '<rootDir>/__mocks__/lib/database.ts',
    '^@/lib/database/index$': '<rootDir>/__mocks__/lib/database.ts',
    '^@/lib/redis/client$': '<rootDir>/__mocks__/lib/redis/client.ts',
    // Mock Next.js navigation
    '^next/navigation$': '<rootDir>/__tests__/__mocks__/next-navigation.ts',
    // Mock ioredis
    '^ioredis$': '<rootDir>/__tests__/__mocks__/ioredis.ts',
    // Handle module aliases (must be last due to wildcard)
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.test.{js,jsx,ts,tsx}',
  ],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!app/**/*.d.ts',
    '!**/*.config.js',
    '!**/*.config.ts',
    '!**/node_modules/**',
  ],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);