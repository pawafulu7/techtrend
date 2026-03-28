import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { FavoritesContent } from './_components/favorites-content';
import { type SortOption, VALID_SORT_OPTIONS } from './_types';

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    const { q, sort } = await searchParams;
    const callbackUrl =
      q || sort
        ? `/favorites?${new URLSearchParams({ ...(q && { q }), ...(sort && { sort }) }).toString()}`
        : '/favorites';
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const { q, sort } = await searchParams;

  const initialQuery = q ?? '';
  const initialSort: SortOption = VALID_SORT_OPTIONS.includes(
    sort as SortOption
  )
    ? (sort as SortOption)
    : 'favoritedAt-desc';

  return (
    <FavoritesContent initialQuery={initialQuery} initialSort={initialSort} />
  );
}
