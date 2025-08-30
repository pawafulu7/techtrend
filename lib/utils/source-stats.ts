export interface ArticleWithTags {
  publishedAt: Date;
  qualityScore: number;
  tags: { name: string }[];
}

export interface SourceStats {
  totalArticles: number;
  avgQualityScore: number;
  popularTags: string[];
  publishFrequency: number;
  lastPublished: Date | null;
  growthRate: number;
}

/**
 * 品質スコアの平均値を計算
 */
export function calculateAverageQualityScore(articles: Array<{ qualityScore: number }>): number {
  if (articles.length === 0) return 0;
  
  const totalScore = articles.reduce((sum, article) => sum + article.qualityScore, 0);
  return Math.round(totalScore / articles.length);
}

/**
 * 投稿頻度を計算（過去30日間の記事数から日あたりの記事数を算出）
 */
export function calculatePublishFrequency(articles: Array<{ publishedAt: Date }>): number {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentArticles = articles.filter(
    article => article.publishedAt >= thirtyDaysAgo
  );
  
  // 30日間の記事数を30で割って、小数点第1位まで保持
  return Math.round((recentArticles.length / 30) * 10) / 10;
}

/**
 * 人気タグを抽出（上位5つ）
 */
export function extractPopularTags(articles: Array<{ tags: { name: string }[] }>, limit: number = 5): string[] {
  const tagCounts: Record<string, number> = {};
  
  articles.forEach(article => {
    article.tags.forEach(tag => {
      tagCounts[tag.name] = (tagCounts[tag.name] || 0) + 1;
    });
  });
  
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tagName]) => tagName);
}

/**
 * 成長率を計算（過去30日と過去60-30日の比較）
 */
export function calculateGrowthRate(articles: Array<{ publishedAt: Date }>): number {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  
  const recentArticles = articles.filter(
    article => article.publishedAt >= thirtyDaysAgo
  );
  
  const pastMonthArticles = articles.filter(
    article => article.publishedAt >= sixtyDaysAgo && article.publishedAt < thirtyDaysAgo
  );
  
  const currentMonthCount = recentArticles.length;
  const pastMonthCount = pastMonthArticles.length;
  
  if (pastMonthCount > 0) {
    return Math.round(((currentMonthCount - pastMonthCount) / pastMonthCount) * 100);
  } else if (currentMonthCount > 0) {
    return 100; // 前月0件で今月記事があれば100%成長
  } else {
    return 0;
  }
}

/**
 * 最終投稿日を取得
 */
export function getLastPublishedDate(articles: Array<{ publishedAt: Date }>): Date | null {
  if (articles.length === 0) return null;
  
  // publishedAtで降順ソート済みの場合は最初の要素
  // そうでない場合は最大値を探す
  const sortedArticles = [...articles].sort((a, b) => 
    b.publishedAt.getTime() - a.publishedAt.getTime()
  );
  
  return sortedArticles[0]?.publishedAt || null;
}

/**
 * ソースの統計情報を一括計算
 */
export function calculateSourceStats(
  articles: ArticleWithTags[],
  totalArticles?: number
): SourceStats {
  const articleCount = totalArticles ?? articles.length;
  
  return {
    totalArticles: articleCount,
    avgQualityScore: calculateAverageQualityScore(articles),
    popularTags: extractPopularTags(articles),
    publishFrequency: calculatePublishFrequency(articles),
    lastPublished: getLastPublishedDate(articles),
    growthRate: calculateGrowthRate(articles)
  };
}

/**
 * ソースカテゴリを推定
 */
export type SourceCategory = 'tech_blog' | 'company_blog' | 'personal_blog' | 'news_site' | 'community' | 'other';

export function estimateSourceCategory(sourceName: string): SourceCategory {
  const nameLower = sourceName.toLowerCase();
  
  if (nameLower.includes('blog')) {
    if (nameLower.includes('company') || nameLower.includes('tech')) {
      return 'company_blog';
    } else {
      return 'personal_blog';
    }
  } else if (nameLower.includes('news')) {
    return 'news_site';
  } else if (['qiita', 'zenn', 'dev.to', 'reddit'].some(c => nameLower.includes(c))) {
    return 'community';
  } else if (['techcrunch', 'hacker news'].some(c => nameLower.includes(c))) {
    return 'news_site';
  }
  
  return 'other';
}
