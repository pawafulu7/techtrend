/**
 * Mock for Redis factory
 */

// Default mock service object
const mockRedisService = {
  clearPattern: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  getJSON: jest.fn().mockResolvedValue(null),
  setJSON: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  expire: jest.fn().mockResolvedValue(undefined),
};

export const getRedisService = jest.fn(() => mockRedisService);
export const closeRedisConnection = jest.fn(() => Promise.resolve());
export const createRedisService = jest.fn(() => mockRedisService);
