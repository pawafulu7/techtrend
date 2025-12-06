/**
 * Response utilities for Articles API
 *
 * Handles response transformation and formatting.
 */

import { NextResponse } from 'next/server';
import { MetricsCollector } from '@/lib/metrics/performance';
import type { ArticleQueryResult } from './types';

/**
 * Transform article items to include contentLength instead of full content
 * This reduces response payload size significantly
 *
 * Note: Uses runtime property replacement. The return type maintains the input type
 * for compatibility with ArticleQueryResult, but 'content' is replaced with 'contentLength'
 * at runtime.
 */
export function transformArticleItems<T>(items: T[] | undefined): T[] {
  if (!items) return [];

  return items.map((article) => {
    if (typeof article === 'object' && article !== null) {
      const { content, ...rest } = article as Record<string, unknown>;
      return {
        ...rest,
        contentLength: typeof content === 'string' ? content.length : null,
      } as T;
    }
    return article;
  });
}

/**
 * Transform query result to API response format
 */
export function transformQueryResult(
  result: ArticleQueryResult | null
): ArticleQueryResult | null {
  if (!result) return result;

  return {
    ...result,
    items: transformArticleItems(result.items),
  };
}

/**
 * Cache control options for responses
 */
export interface CacheControlOptions {
  isUserDependent: boolean;
  hasPersonalization: boolean;
  hasAuthorization: boolean;
}

/**
 * Create a successful GET response with proper headers
 */
export function createGetResponse(
  result: ArticleQueryResult | null,
  options: {
    includeUserData: boolean;
    hasUserId: boolean;
    cacheOptions: CacheControlOptions;
    metrics: MetricsCollector;
  }
): NextResponse {
  const { includeUserData, hasUserId, cacheOptions, metrics } = options;

  // Transform result to reduce payload
  const transformedResult = transformQueryResult(result);

  // Create response
  const response = NextResponse.json({
    success: true,
    data: transformedResult,
    meta: {
      userDataIncluded: includeUserData && hasUserId,
    },
  });

  // Add performance metrics to headers
  metrics.addMetricsToHeaders(response.headers);

  // Set cache headers based on whether response is user-dependent
  const isUserDependent =
    cacheOptions.isUserDependent ||
    cacheOptions.hasPersonalization ||
    cacheOptions.hasAuthorization;

  if (isUserDependent) {
    // User-specific responses should not be cached publicly
    response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('X-Cache-Bypass', 'user-context');
  } else {
    // Public responses can be cached
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 'max-age=300');
  }

  // Always set Vary header for proper cache key generation
  response.headers.set('Vary', 'Accept-Encoding, Authorization');

  return response;
}

/**
 * Create an empty paginated response
 */
export function createEmptyResponse(page: number, limit: number): ArticleQueryResult {
  return {
    items: [],
    total: 0,
    page,
    limit,
    totalPages: 0,
  };
}
