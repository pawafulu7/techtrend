/**
 * usePersonalizationPreferences Hook Tests
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import {
  useInterestCategories,
  useUserPreferences,
  useUpdatePreferences,
  usePersonalizationPreferences,
} from '@/lib/hooks/use-personalization-preferences';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Test wrapper with React Query
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useInterestCategories', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should fetch categories successfully', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        slug: 'frontend',
        name: 'Frontend',
        description: 'Web UI',
        icon: 'Monitor',
        sortOrder: 1,
        isActive: true,
        articleCount: 100,
      },
      {
        id: 'cat-2',
        slug: 'backend',
        name: 'Backend',
        description: 'Server-side',
        icon: 'Server',
        sortOrder: 2,
        isActive: true,
        articleCount: 50,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ categories: mockCategories }),
    });

    const { result } = renderHook(() => useInterestCategories(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockCategories);
    expect(mockFetch).toHaveBeenCalledWith('/api/interest-categories');
  });

  it('should handle fetch error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useInterestCategories(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain('Failed to fetch categories');
  });
});

describe('useUserPreferences', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should fetch user preferences successfully', async () => {
    const mockPreferences = {
      selectedCategories: ['cat-1', 'cat-2'],
      filterEnabled: true,
      periodMonths: 12,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPreferences),
    });

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockPreferences);
    expect(mockFetch).toHaveBeenCalledWith('/api/user/preferences/categories');
  });

  it('should return default preferences when not authenticated', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const { result } = renderHook(() => useUserPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual({
      selectedCategories: [],
      filterEnabled: false,
      periodMonths: 12,
    });
  });
});

describe('useUpdatePreferences', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should update preferences successfully', async () => {
    const mockResponse = {
      success: true,
      selectedCategories: ['cat-1', 'cat-2'],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { result } = renderHook(() => useUpdatePreferences(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      categoryIds: ['cat-1', 'cat-2'],
      filterEnabled: true,
      periodMonths: 12,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/user/preferences/categories',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryIds: ['cat-1', 'cat-2'],
          filterEnabled: true,
          periodMonths: 12,
        }),
      })
    );
  });

  it('should handle update error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid category IDs' }),
    });

    const { result } = renderHook(() => useUpdatePreferences(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({
      categoryIds: ['invalid-id'],
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Invalid category IDs');
  });
});

describe('usePersonalizationPreferences', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should combine categories and preferences', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        slug: 'frontend',
        name: 'Frontend',
        description: null,
        icon: 'Monitor',
        sortOrder: 1,
        isActive: true,
        articleCount: 100,
      },
    ];

    const mockPreferences = {
      selectedCategories: ['cat-1'],
      filterEnabled: true,
      periodMonths: 6,
    };

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ categories: mockCategories }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPreferences),
      });

    const { result } = renderHook(() => usePersonalizationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.selectedCategories).toEqual(['cat-1']);
    expect(result.current.filterEnabled).toBe(true);
    expect(result.current.periodMonths).toBe(6);
    expect(result.current.hasPreferences).toBe(true);
  });

  it('should return defaults when no preferences', async () => {
    const mockCategories = [
      {
        id: 'cat-1',
        slug: 'frontend',
        name: 'Frontend',
        description: null,
        icon: 'Monitor',
        sortOrder: 1,
        isActive: true,
        articleCount: 100,
      },
    ];

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ categories: mockCategories }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

    const { result } = renderHook(() => usePersonalizationPreferences(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.categories).toEqual(mockCategories);
    expect(result.current.selectedCategories).toEqual([]);
    expect(result.current.filterEnabled).toBe(false);
    expect(result.current.periodMonths).toBe(12);
    expect(result.current.hasPreferences).toBe(false);
  });
});
