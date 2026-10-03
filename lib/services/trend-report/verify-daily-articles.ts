/**
 * カテゴリの代表記事のうち、引き直した記事（`verifiedIds`）に無いものを外す（issue #688）。
 * 非表示・無効化したソース・削除済みの記事の題名を、保存済みのレポートから出さないため。
 * `/api/trends/daily` と Server Component（daily-data.ts）の両方が使う
 */
export function withVerifiedCategoryTopArticles(
  categories: unknown,
  verifiedIds: ReadonlySet<string>
): unknown {
  if (!Array.isArray(categories)) return categories;
  return categories.map((category) => {
    const topArticle = (category as { topArticle?: { id?: unknown } | null })
      ?.topArticle;
    if (!topArticle) return category;
    return typeof topArticle.id === 'string' && verifiedIds.has(topArticle.id)
      ? category
      : { ...(category as Record<string, unknown>), topArticle: null };
  });
}
