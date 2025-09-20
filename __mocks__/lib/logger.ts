// Mock implementation of logger for tests
const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
  fatal: jest.fn(),
  trace: jest.fn(),
};

export const createLogger = jest.fn(() => mockLogger);

export default mockLogger;