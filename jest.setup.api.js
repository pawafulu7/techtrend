// Setup file for API tests with MSW

// Polyfill for TextEncoder/TextDecoder in jsdom environment
import { TextEncoder, TextDecoder } from 'util';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill for fetch API in test environment
import 'whatwg-fetch';

// Mock environment variables
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

// Mock window.matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

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
    _reset: jest.fn(), // Add _reset method for tests
  }));
  return RedisMock;
});