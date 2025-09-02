/**
 * Mock for recommendation service
 */

export const recommendationService = {
  getRecommendations: jest.fn(),
  getUserInterests: jest.fn(),
  calculateSimilarity: jest.fn(),
};