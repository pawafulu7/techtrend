/** AI の本文に混ざった内部参照を取り除く。記事 ID の配列はそのまま保持する。 */
export function stripInternalArticleRefs(value: string): string {
  return value
    .replace(/[（(\[【]\s*A\d+(?:\s*[,、，・]\s*A\d+)*\s*[）)\]】]/g, '')
    .trim();
}

export function sanitizeTrendAiText<T>(value: T): T {
  if (typeof value === 'string') return stripInternalArticleRefs(value) as T;
  if (Array.isArray(value))
    return value.map((item) => sanitizeTrendAiText(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        [
          'version',
          'evidenceArticleIds',
          'articleIds',
          'relatedArticleIds',
        ].includes(key)
          ? item
          : sanitizeTrendAiText(item),
      ])
    ) as T;
  }
  return value;
}
