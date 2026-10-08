/**
 * ストーリー（同じ出来事の記事のまとまり）の代表の記事を選ぶ規則（issue #723）。
 * バッチ（lib/services/story-clustering.ts）とホームの一覧（app/components/article/story-grouping.ts）
 * で同じ規則を使うため、ここにまとめる。
 */

export interface StoryRepresentativeCandidate {
  id: string;
  title: string;
  qualityScore?: number | null;
  publishedAt: Date | string;
}

// かな・漢字を含むタイトルを日本語の記事とみなす（英語の記事は title が原文で、訳は translatedTitle）
const JAPANESE_PATTERN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export function isJapaneseTitle(title: string): boolean {
  return JAPANESE_PATTERN.test(title);
}

/**
 * 代表として優れている順に並べる比較関数。日本語の記事を優先し、その中で品質スコアの高いもの。
 * 同点なら公開の早いもの、それも同じなら ID の小さいもの（入力の順で代表が揺れないように）
 */
export function compareStoryRepresentative(
  a: StoryRepresentativeCandidate,
  b: StoryRepresentativeCandidate
): number {
  const ja =
    Number(isJapaneseTitle(b.title)) - Number(isJapaneseTitle(a.title));
  if (ja !== 0) return ja;
  const quality = (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
  if (quality !== 0) return quality;
  const time =
    new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function pickStoryRepresentative<T extends StoryRepresentativeCandidate>(
  members: T[]
): T {
  return [...members].sort(compareStoryRepresentative)[0];
}
