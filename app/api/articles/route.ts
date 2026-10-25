/**
 * Articles API Route Handler
 *
 * Entry point for /api/articles endpoint.
 * Delegates to modular handlers.
 *
 * GET  - List articles with pagination, filtering, and personalization
 */

import { NextRequest } from 'next/server';
import { handleGet } from './handlers';

/**
 * GET /api/articles
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - sortBy: Sort field (publishedAt, createdAt, qualityScore, bookmarks, userVotes)
 * - sortOrder: Sort direction (asc, desc)
 * - sources: Comma-separated source IDs
 * - sourceId: Single source ID (deprecated, use sources)
 * - tag: Single tag filter
 * - tags: Comma-separated tags
 * - tagMode: Tag filter mode (OR, AND)
 * - search: Search query (title, summary)
 * - dateRange: Date range filter (today, week, month, year, all)
 * - readFilter: Read status filter (read, unread) - requires auth
 * - category: Article category filter
 * - includeRelations: Include source and tags relations
 * - includeEmptyContent: Include articles with no content
 * - excludeUnprocessed: Exclude unprocessed articles
 * - lightweight: Return minimal fields only
 * - fields: Comma-separated field selection
 * - includeUserData: Include favorites and read status
 * - categoryIds: Comma-separated category IDs for personalization
 * - periodMonths: Period months for personalization
 */
export async function GET(request: NextRequest) {
  return handleGet(request);
}
