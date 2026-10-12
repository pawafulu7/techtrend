import type { Prisma } from '@/lib/prisma-exports';

// サムネイルがスライドの1枚目になるソース。切り抜くと文字が欠けるので、全体を収めて表示する。
// 一覧のカードは記事 URL のホストでも判定する（isSlideArticle）。詳細ページはソース名で判定し、
// はてブ経由のスライドは要約が無いときだけ URL のホストで判定する
const SLIDE_SOURCE_NAMES = new Set(['Speaker Deck', 'Docswell']);
const SLIDE_HOSTS = new Set(['speakerdeck.com', 'docswell.com']);

/**
 * スライド共有サービスのソースかを判定する
 */
export function isSlideSource(sourceName: string | null | undefined): boolean {
  return !!sourceName && SLIDE_SOURCE_NAMES.has(sourceName);
}

/**
 * スライド共有サービスの記事か。はてなブックマーク経由で集めた記事はソース名では
 * 分からないので、記事 URL のホストでも判定する
 */
export function isSlideArticle(article: {
  sourceName?: string | null;
  url?: string | null;
}): boolean {
  if (isSlideSource(article.sourceName)) return true;
  try {
    const host = new URL(article.url ?? '').hostname.replace(/^www\./, '');
    return SLIDE_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * isSlideArticle の判定を DB の検索条件として表す。URL は収集時の形（小文字のホスト・ポートなし）を前提に
 * 前方一致で見るので、大文字のホストやポート付きの URL は isSlideArticle とずれる
 */
export function slideArticleWhere(): Prisma.ArticleWhereInput {
  const urlPrefixes = [...SLIDE_HOSTS].flatMap((host) =>
    ['https', 'http'].flatMap((scheme) => [
      `${scheme}://${host}/`,
      `${scheme}://www.${host}/`,
    ])
  );
  return {
    OR: [
      { source: { name: { in: [...SLIDE_SOURCE_NAMES] } } },
      ...urlPrefixes.map((prefix) => ({ url: { startsWith: prefix } })),
    ],
  };
}

/**
 * 要約が無く、スライドの画像（hasValidThumbnail と同じく http(s) の URL）がある記事。
 * 詳細ページ・リーダー・カードは要約の代わりに画像を出すので、一覧の「要約の無い記事」
 * 「低品質の記事」の除外から外す。要約のあるスライドは他の記事と同じ条件で判定する
 */
export function slideWithoutSummaryWhere(): Prisma.ArticleWhereInput {
  return {
    AND: [
      slideArticleWhere(),
      { summaryComputedAt: null },
      {
        OR: [
          { thumbnail: { startsWith: 'https://' } },
          { thumbnail: { startsWith: 'http://' } },
        ],
      },
    ],
  };
}
