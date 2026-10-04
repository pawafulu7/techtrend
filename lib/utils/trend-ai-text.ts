const PRESERVED_KEYS = new Set([
  'version',
  'evidenceArticleIds',
  'articleIds',
  'relatedArticleIds',
]);

/** AI の本文に混ざった内部参照と直前の水平空白を取り除く。改行は保持する。 */
export function stripInternalArticleRefs(value: string): string {
  return value
    .replace(
      /[^\S\r\n]*[（(\[【]\s*A\d+(?:\s*[,、，・]\s*A\d+)*\s*[）)\]】]/g,
      ''
    )
    .trim();
}

/** 本文を再帰的に整形し、version と記事リンクの参照配列は保持する。 */
export function sanitizeTrendAiText<T>(value: T): T {
  if (typeof value === 'string') return stripInternalArticleRefs(value) as T;
  if (Array.isArray(value))
    return value.map((item) => sanitizeTrendAiText(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        PRESERVED_KEYS.has(key) ? item : sanitizeTrendAiText(item),
      ])
    ) as T;
  }
  return value;
}
