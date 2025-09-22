/**
 * ソースAPIで使用する共通ヘルパー関数
 */

// ソースカテゴリーの型定義
export type SourceCategory = 'company_blog' | 'personal_blog' | 'news_site' | 'community' | 'other';

/**
 * ソース名からカテゴリーを推定する
 */
export function inferSourceCategory(sourceName: string): SourceCategory {
  let category: SourceCategory = 'other';
  const nameLower = sourceName.toLowerCase();

  if (nameLower.includes('blog')) {
    if (nameLower.includes('company') || nameLower.includes('tech')) {
      category = 'company_blog';
    } else {
      category = 'personal_blog';
    }
  } else if (nameLower.includes('news')) {
    category = 'news_site';
  } else if (['qiita', 'zenn', 'dev.to', 'reddit'].some(c => nameLower.includes(c))) {
    category = 'community';
  } else if (['techcrunch', 'hacker news'].some(c => nameLower.includes(c))) {
    category = 'news_site';
  }

  return category;
}

/**
 * ソートに必要な共通インターフェース
 */
export interface SortableSource {
  name: string;
  stats: {
    totalArticles: number;
    avgQualityScore: number;
    publishFrequency: number;
  };
}

/**
 * ソースをソートする共通関数
 */
export function sortSources<T extends SortableSource>(
  sources: T[],
  sortBy = 'articles',
  order = 'desc'
): T[] {
  return sources.sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;

    switch (sortBy) {
      case 'articles':
        aValue = a.stats.totalArticles;
        bValue = b.stats.totalArticles;
        break;
      case 'quality':
        aValue = a.stats.avgQualityScore;
        bValue = b.stats.avgQualityScore;
        break;
      case 'frequency':
        aValue = a.stats.publishFrequency;
        bValue = b.stats.publishFrequency;
        break;
      case 'name':
        aValue = a.name;
        bValue = b.name;
        break;
      default:
        aValue = a.stats.totalArticles;
        bValue = b.stats.totalArticles;
    }

    // 文字列の場合はlocaleCompareを使用
    if (sortBy === 'name') {
      return order === 'asc'
        ? (aValue as string).localeCompare(bValue as string)
        : (bValue as string).localeCompare(aValue as string);
    } else {
      // 数値の場合は通常の比較
      return order === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    }
  });
}