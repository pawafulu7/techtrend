export function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${h}:${m}`;
  } catch {
    return '';
  }
}

/**
 * 同じ id の記事の 2 件目以降を除く。一覧は offset でページを読むので、2 ページ目を読む間に新着が入ると、
 * ページの境目で同じ記事が 2 回届く（そのままだと次の記事が同じ記事に留まり、行の key と id も重なる）
 */
export function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * fromId の次の記事の id（重なりを除いた並びで探す）。fromId が無い・一覧に無いときは null。
 * 番号で選ぶと、読み直した一覧では関係の無い記事を開くので、番号に頼らない
 */
export function nextArticleIdAfter(
  items: readonly { id: string }[],
  fromId: string | undefined
): string | null {
  if (!fromId) return null;
  const unique = uniqueById(items);
  const index = unique.findIndex((item) => item.id === fromId);
  return index >= 0 ? (unique[index + 1]?.id ?? null) : null;
}
