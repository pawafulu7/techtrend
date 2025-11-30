/**
 * Interest Categories API Tests
 */

import { GET } from '@/app/api/interest-categories/route';

// Mock the category filter service
const mockGetCategoriesWithCounts = jest.fn();
jest.mock('@/lib/personalization/category-filter-service', () => ({
  categoryFilterService: {
    getCategoriesWithCounts: () => mockGetCategoriesWithCounts(),
  },
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  sanitizeError: (e: Error) => ({ message: e.message }),
}));

describe('GET /api/interest-categories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockCategories = [
    {
      id: 'cat-1',
      slug: 'frontend',
      name: 'Frontend',
      description: 'Web UI development',
      icon: 'Monitor',
      sortOrder: 1,
      isActive: true,
      articleCount: 2500,
    },
    {
      id: 'cat-2',
      slug: 'backend',
      name: 'Backend',
      description: 'Server-side development',
      icon: 'Server',
      sortOrder: 2,
      isActive: true,
      articleCount: 1800,
    },
  ];

  it('should return categories with article counts', async () => {
    mockGetCategoriesWithCounts.mockResolvedValue(mockCategories);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toHaveLength(2);
    expect(data.categories[0].slug).toBe('frontend');
    expect(data.categories[0].articleCount).toBe(2500);
    expect(data.cacheMaxAge).toBe(300);
  });

  it('should include cache headers', async () => {
    mockGetCategoriesWithCounts.mockResolvedValue(mockCategories);

    const response = await GET();

    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=300, stale-while-revalidate=60'
    );
  });

  it('should return empty array when no categories exist', async () => {
    mockGetCategoriesWithCounts.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.categories).toEqual([]);
  });

  it('should handle service errors', async () => {
    mockGetCategoriesWithCounts.mockRejectedValue(new Error('Database error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to retrieve categories');
  });
});
