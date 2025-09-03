/**
 * Mock for recommendation service
 */

export const recommendationService = {
  getRecommendations: jest.fn(),
  getUserInterests: jest.fn(),
  calculateSimilarity: jest.fn(),
};

export const resetRecommendationServiceMock = () => {
  recommendationService.getRecommendations.mockReset();
  recommendationService.getUserInterests.mockReset();
  recommendationService.calculateSimilarity.mockReset();
};