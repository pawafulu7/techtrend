import { redirect } from 'next/navigation';

/**
 * Legacy favorites page redirect
 *
 * This page has been consolidated into /favorites.
 * Redirects all traffic to the new location.
 */
export default function ArticleFavoritesPage() {
  redirect('/favorites');
}
