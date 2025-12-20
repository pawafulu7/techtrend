// Redis factoryのモック

export const mockRedisClient = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  quit: jest.fn().mockResolvedValue('OK'),
};

export const mockRedisService = {
  getJSON: jest.fn().mockResolvedValue(null),
  setJSON: jest.fn().mockResolvedValue(undefined),
  client: mockRedisClient,
  disconnect: jest.fn().mockResolvedValue(undefined),
};

export const createRedisClient = jest.fn().mockReturnValue(mockRedisClient);

export const getRedisService = jest.fn().mockReturnValue(mockRedisService);