import { PrismaClient } from '@/lib/prisma-exports';
import type {
  ArticleWithRelations,
  TopArticleInfo,
  CategoryInfo,
  TagInfo,
} from './types';
import { CATEGORY_TAGS, JST_OFFSET_MS } from './types';

/**
 * Fetch articles within the given date range.
 */
export async function fetchArticles(
  prisma: PrismaClient,
  start: Date,
  end: Date
): Promise<ArticleWithRelations[]> {
  return prisma.article.findMany({
    where: {
      publishedAt: {
        gte: start,
        lt: end,
      },
    },
    include: {
      tags: true,
      source: true,
      _count: {
        select: {
          articleViews: true,
          favorites: true,
        },
      },
    },
    orderBy: {
      publishedAt: 'desc',
    },
  });
}

/**
 * Calculate top articles by score (views * 1 + favorites * 3).
 */
export function calculateTopArticles(
  articles: ArticleWithRelations[]
): TopArticleInfo[] {
  return articles
    .map((article) => {
      const viewCount = article._count.articleViews;
      const favoriteCount = article._count.favorites;
      const score = viewCount * 1 + favoriteCount * 3;

      return {
        id: article.id,
        title: article.title,
        translatedTitle: article.translatedTitle,
        url: article.url,
        sourceName: article.source.name,
        viewCount,
        favoriteCount,
        score,
        tags: article.tags.map((t) => t.name),
        thumbnail: article.thumbnail,
        detailedSummary: article.detailedSummary,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Calculate category-based aggregation.
 */
export function calculateCategories(
  articles: ArticleWithRelations[]
): CategoryInfo[] {
  const categoryMap = new Map<string, Set<string>>();
  const categoryArticles = new Map<string, ArticleWithRelations[]>();

  articles.forEach((article) => {
    const articleTags = article.tags.map((t) => t.name.toLowerCase());

    for (const [category, tags] of Object.entries(CATEGORY_TAGS)) {
      const lowerTags = tags.map((t) => t.toLowerCase());
      const hasMatch = articleTags.some((tag) => lowerTags.includes(tag));

      if (hasMatch) {
        if (!categoryArticles.has(category)) {
          categoryArticles.set(category, []);
          categoryMap.set(category, new Set());
        }
        if (!categoryMap.get(category)!.has(article.id)) {
          categoryMap.get(category)!.add(article.id);
          categoryArticles.get(category)!.push(article);
        }
      }
    }
  });

  const categories: CategoryInfo[] = [];
  const totalCategorized = Array.from(categoryArticles.values()).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  for (const [name, catArticles] of categoryArticles.entries()) {
    const topArticle = calculateTopArticles(catArticles)[0];
    categories.push({
      name,
      count: catArticles.length,
      percentage:
        totalCategorized > 0
          ? Math.round((catArticles.length / totalCategorized) * 100)
          : 0,
      topArticle: topArticle
        ? {
            id: topArticle.id,
            title: topArticle.title,
            translatedTitle: topArticle.translatedTitle,
          }
        : null,
    });
  }

  return categories.sort((a, b) => b.count - a.count);
}

/**
 * Calculate tag-based aggregation.
 */
export function calculateTags(articles: ArticleWithRelations[]): TagInfo[] {
  const tagCount = new Map<string, number>();

  articles.forEach((article) => {
    article.tags.forEach((tag) => {
      tagCount.set(tag.name, (tagCount.get(tag.name) || 0) + 1);
    });
  });

  const totalTags = Array.from(tagCount.values()).reduce(
    (sum, count) => sum + count,
    0
  );

  return Array.from(tagCount.entries())
    .map(([name, count]) => ({
      name,
      count,
      percentage:
        totalTags > 0 ? Math.round((count / totalTags) * 100 * 10) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// ========================================
// Date calculation helpers (JST-based)
// ========================================

/**
 * Get day range (JST-based).
 */
export function getDayRangeJST(date: Date): { start: Date; end: Date } {
  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);
  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth();
  const day = jstDate.getUTCDate();

  const start = new Date(
    Date.UTC(year, month, day, 0, 0, 0, 0) - JST_OFFSET_MS
  );
  const end = new Date(
    Date.UTC(year, month, day + 1, 0, 0, 0, 0) - JST_OFFSET_MS
  );

  return { start, end };
}

/**
 * Get week range (JST-based, Monday start).
 */
export function getWeekRangeJST(date: Date): { start: Date; end: Date } {
  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);

  const dayOfWeek = jstDate.getUTCDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(jstDate);
  monday.setUTCDate(jstDate.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);

  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  const start = new Date(monday.getTime() - JST_OFFSET_MS);
  const end = new Date(nextMonday.getTime() - JST_OFFSET_MS);

  return { start, end };
}

/**
 * Get month range (JST-based).
 */
export function getMonthRangeJST(date: Date): { start: Date; end: Date } {
  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);

  const year = jstDate.getUTCFullYear();
  const month = jstDate.getUTCMonth();

  const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

  const start = new Date(monthStart.getTime() - JST_OFFSET_MS);
  const end = new Date(nextMonthStart.getTime() - JST_OFFSET_MS);

  return { start, end };
}
