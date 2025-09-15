export function buildScrollStorageKey(loc?: Location): string {
  const locationObj = loc ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!locationObj) return 'scroll_position_';

  const { pathname, search } = locationObj;

  // Normalize search params: remove transient params like `returning`
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  params.delete('returning');

  // Ensure stable ordering to avoid mismatched keys due to param order
  const sortedEntries = Array.from(params.entries()).sort(([aKey, aVal], [bKey, bVal]) => {
    if (aKey === bKey) return aVal.localeCompare(bVal);
    return aKey.localeCompare(bKey);
  });
  const sorted = new URLSearchParams();
  for (const [k, v] of sortedEntries) sorted.append(k, v);

  const normalizedSearch = sorted.toString();
  const suffix = normalizedSearch ? `?${normalizedSearch}` : '';

  return 'scroll_position_' + pathname + suffix;
}

