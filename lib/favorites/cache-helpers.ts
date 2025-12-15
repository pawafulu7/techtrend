/**
 * Favorite cache helper functions
 *
 * Common utility functions for cache operations and cookie handling
 * used across favorite API routes.
 */

import { NextResponse } from 'next/server';
import { favoriteCache } from '@/lib/cache/favorites-cache';
import { updateFavoriteCache } from '@/lib/dataloader/favorite-loader';
import logger from '@/lib/logger';

/**
 * Update favorite cache in a best-effort manner
 * DB operations should succeed even if cache update fails
 *
 * @param userId - User ID
 * @param articleId - Article ID
 * @param isFavorited - Whether the article is favorited
 * @param favoritedAt - When the article was favorited (for add operations)
 */
export async function updateFavoriteCacheBestEffort(
  userId: string,
  articleId: string,
  isFavorited: boolean,
  favoritedAt?: Date
): Promise<void> {
  try {
    await favoriteCache.updateSingle(userId, articleId, isFavorited);
    await updateFavoriteCache(userId, articleId, isFavorited, favoritedAt);
  } catch (error) {
    logger.warn(
      { error, userId, articleId },
      'Cache update failed (best-effort)'
    );
  }
}

/**
 * Set the favorite bust cookie on the response
 * This cookie signals to the client that favorite cache should be bypassed
 *
 * @param response - NextResponse object to set the cookie on
 */
export function setFavoriteBustCookie(response: NextResponse): void {
  response.cookies.set({
    name: 'tt_fav_bust',
    value: String(Date.now()),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 35,
    secure: process.env.NODE_ENV === 'production',
  });
}
