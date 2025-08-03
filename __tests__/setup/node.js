// Setup for Node.js test environment (API tests)

// Mock environment variables
process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.GEMINI_API_KEY = 'test-api-key';
process.env.NODE_ENV = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Mock ioredis
jest.mock('ioredis', () => {
  const RedisMock = jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    on: jest.fn(),
    quit: jest.fn(),
  }));
  return RedisMock;
});