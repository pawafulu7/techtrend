/**
 * Shared metrics types for DataLoader and cache statistics
 *
 * Used across API routes and dashboard to avoid type duplication.
 */

/**
 * Partial DataLoader statistics
 *
 * Subset of full DataLoader metrics used in batch optimizer.
 * For complete metrics, see app/dashboard/performance/types/dashboard.ts
 */
export interface PartialDataLoaderStats {
  l1Hits?: number;
  l2Hits?: number;
  totalRequests?: number;
}
