export type SortOption =
  | 'favoritedAt-desc'
  | 'favoritedAt-asc'
  | 'publishedAt-desc';

export const VALID_SORT_OPTIONS: SortOption[] = [
  'favoritedAt-desc',
  'favoritedAt-asc',
  'publishedAt-desc',
];
