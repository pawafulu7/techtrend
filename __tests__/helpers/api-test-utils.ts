import { server } from '../msw/server';
import { http, HttpResponse } from 'msw';

/**
 * Test utility functions for API testing
 */

/**
 * Make a request to an API endpoint
 */
export async function apiRequest(path: string, options?: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  const data = await response.json();
  return {
    data,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

/**
 * Override MSW handlers for a specific test
 */
export function overrideHandler(path: string, response: any, status = 200) {
  server.use(
    http.get(path, () => {
      return HttpResponse.json(response, { status });
    })
  );
}

/**
 * Override handler to simulate an error
 */
export function simulateError(path: string, status = 500, message = 'Internal Server Error') {
  server.use(
    http.get(path, () => {
      return HttpResponse.json(
        { success: false, error: message },
        { status }
      );
    })
  );
}

/**
 * Override handler to simulate network failure
 */
export function simulateNetworkError(path: string) {
  server.use(
    http.get(path, () => {
      return HttpResponse.error();
    })
  );
}

/**
 * Wait for async operations
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create mock pagination data
 */
export function createPaginationData<T>(
  items: T[],
  page = 1,
  limit = 20
): {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
} {
  const start = (page - 1) * limit;
  const end = start + limit;
  const paginatedItems = items.slice(start, end);
  
  return {
    items: paginatedItems,
    total: items.length,
    page,
    limit,
    totalPages: Math.ceil(items.length / limit),
  };
}

/**
 * Assert API response structure
 */
export function assertApiResponse(response: any) {
  expect(response).toHaveProperty('success');
  expect(response).toHaveProperty('data');
  
  if (response.success === false) {
    expect(response).toHaveProperty('error');
  }
}

/**
 * Assert pagination structure
 */
export function assertPagination(data: any) {
  expect(data).toHaveProperty('items');
  expect(data).toHaveProperty('total');
  expect(data).toHaveProperty('page');
  expect(data).toHaveProperty('limit');
  expect(data).toHaveProperty('totalPages');
  expect(Array.isArray(data.items)).toBe(true);
  expect(typeof data.total).toBe('number');
  expect(typeof data.page).toBe('number');
  expect(typeof data.limit).toBe('number');
  expect(typeof data.totalPages).toBe('number');
}