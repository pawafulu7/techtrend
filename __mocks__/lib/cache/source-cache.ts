export const sourceCache = {
  getStats: jest.fn().mockResolvedValue(null),
  setStats: jest.fn().mockResolvedValue(undefined),
  getAllSourcesWithStats: jest.fn().mockResolvedValue(null),
  setAllSourcesWithStats: jest.fn().mockResolvedValue(undefined),
};