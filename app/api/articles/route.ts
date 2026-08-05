/**
 * Articles API Route Handler
 *
 * Entry point for /api/articles endpoint.
 * Delegates to modular handlers for GET and POST operations.
 *
 * GET  - List articles with pagination, filtering, and personalization
 * POST - Create new article with tags
 */

import { NextRequest } from 'next/server';
import { handleGet, handlePost } from './handlers';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { withRateLimit } from '@/lib/middleware/with-rate-limit';
import { withCSRFProtection } from '@/lib/middleware/csrf-protection';

/**
 * GET /api/articles
 *
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - sortBy: Sort field (publishedAt, createdAt, qualityScore, bookmarks, userVotes, finalScore)
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

/**
 * POST /api/articles
 *
 * Authorization: admin session required (withAdminAuth). Non-admin and
 * unauthenticated requests are rejected before reaching the handler.
 *
 * Request Body:
 * - title: Article title (required)
 * - url: Article URL (required, unique)
 * - sourceId: Source ID (required)
 * - summary: Article summary
 * - thumbnail: Thumbnail URL
 * - content: Full article content
 * - publishedAt: Publication date (default: now)
 * - tagNames: Array of tag names
 */
export const POST = withCSRFProtection(
  withRateLimit('admin:write', withAdminAuth(handlePost))
);
