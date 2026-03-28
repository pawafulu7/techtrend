export const VALID_SORT_OPTIONS = [
  'favoritedAt-desc',
  'favoritedAt-asc',
  'publishedAt-desc',
] as const;
export type SortOption = (typeof VALID_SORT_OPTIONS)[number];
