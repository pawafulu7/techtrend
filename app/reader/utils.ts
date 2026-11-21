// 日本時間で組み立てる。リーダーの一覧と本文はサーバーでも描くので（_components/reader-articles.tsx）、実行環境の
// タイムゾーン（サーバーは UTC）に依ると、サーバーとブラウザで日時の文字列が食い違いハイドレーションが失敗する
const READER_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 記事の日時を「2026.1.2 05:30」の形にする（日本時間） */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(
    READER_DATE_FORMAT.formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`;
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
