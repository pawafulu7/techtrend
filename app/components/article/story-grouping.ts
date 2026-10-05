/**
 * 読み込み済みの記事を、同じストーリー（同じ出来事）ごとに1枚にまとめる（issue #723）
 *
 * storyId は代表の記事の ID。代表が読み込み済みならそれを出し、まだなら（絞り込みで外れた・
 * 後のページにある）読み込み済みの中から同じ規則（日本語を優先し、品質スコアの高いもの）で選ぶ。
 * 並びは、そのストーリーの記事が一覧で最初に出た位置にする。
 */

export interface StoryGroupable {
  id: string;
  title: string;
  qualityScore?: number | null;
  storyId?: string | null;
  storySize?: number | null;
}

export interface StoryGroup<T extends StoryGroupable> {
  /** 一覧に出す記事 */
  article: T;
  /** まとめていない記事は null */
  storyId: string | null;
  /** ストーリー全体の記事数（まとめていない記事は 1） */
  storySize: number;
}

// lib/services/story-clustering.ts の isJapaneseTitle と同じ判定
const JAPANESE_PATTERN =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

function pickRepresentative<T extends StoryGroupable>(
  storyId: string,
  members: T[]
): T {
  const designated = members.find((m) => m.id === storyId);
  if (designated) return designated;
  return members.reduce((best, m) => {
    const ja =
      Number(JAPANESE_PATTERN.test(m.title)) -
      Number(JAPANESE_PATTERN.test(best.title));
    if (ja !== 0) return ja > 0 ? m : best;
    return (m.qualityScore ?? 0) > (best.qualityScore ?? 0) ? m : best;
  });
}

export function groupArticlesByStory<T extends StoryGroupable>(
  articles: T[]
): StoryGroup<T>[] {
  const members = new Map<string, T[]>();
  for (const article of articles) {
    if (!article.storyId || (article.storySize ?? 0) < 2) continue;
    const list = members.get(article.storyId);
    if (list) list.push(article);
    else members.set(article.storyId, [article]);
  }

  const groups: StoryGroup<T>[] = [];
  const emitted = new Set<string>();
  for (const article of articles) {
    const storyId =
      article.storyId && (article.storySize ?? 0) >= 2 ? article.storyId : null;
    if (!storyId) {
      groups.push({ article, storyId: null, storySize: 1 });
      continue;
    }
    if (emitted.has(storyId)) continue;
    emitted.add(storyId);
    const storyMembers = members.get(storyId) ?? [article];
    groups.push({
      article: pickRepresentative(storyId, storyMembers),
      storyId,
      // 読み込んだ記事の数より少なくは出さない（バッチの更新の途中で食い違ったとき）
      storySize: Math.max(
        storyMembers.length,
        ...storyMembers.map((m) => m.storySize ?? 0)
      ),
    });
  }
  return groups;
}
