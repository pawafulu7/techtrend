// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock environment variables
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.NODE_ENV = 'test';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '';
  },
}));

// Mock window.matchMedia (only in jsdom environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // deprecated
      removeListener: jest.fn(), // deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock ioredis
jest.mock('ioredis', () => {
  const RedisMock = jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    ttl: jest.fn().mockResolvedValue(60),
    ping: jest.fn().mockResolvedValue('PONG'),
    on: jest.fn(),
    quit: jest.fn(),
  }));
  return RedisMock;
});

// Setup MSW (only for API tests)
// MSW setup is moved to individual test files that need it