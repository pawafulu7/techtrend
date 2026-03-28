import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/auth';
import { FavoritesContent } from './_components/favorites-content';

type SortOption = 'favoritedAt-desc' | 'favoritedAt-asc' | 'publishedAt-desc';

const VALID_SORT_OPTIONS: SortOption[] = [
  'favoritedAt-desc',
  'favoritedAt-asc',
  'publishedAt-desc',
];

export default async function FavoritesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/favorites');
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
