import { prisma } from '@/lib/prisma';
import type { Favorite, ArticleView } from '@prisma/client';

/**
 * 複数記事のお気に入り状態を一括取得
 * DataLoaderの代替として、シンプルなバッチ取得を提供
 */
export async function batchGetFavorites(
  userId: string,
  articleIds: string[]
): Promise<boolean[]> {
  if (articleIds.length === 0) {
    return [];
  }

  const favorites = await prisma.favorite.findMany({
    where: {
      userId,
      articleId: { in: articleIds }
    },
    select: {
      articleId: true
    }
  });

  const favoriteSet = new Set(favorites.map(f => f.articleId));
  return articleIds.map(id => favoriteSet.has(id));
}

/**
 * 複数記事の閲覧状態を一括取得
 * DataLoaderの代替として、シンプルなバッチ取得を提供
 */
export async function batchGetViews(
  userId: string,
  articleIds: string[]
): Promise<boolean[]> {
  if (articleIds.length === 0) {
    return [];
  }

  const views = await prisma.articleView.findMany({
    where: {
      userId,
      articleId: { in: articleIds },
      isRead: true
    },
    select: {
      articleId: true
    }
  });

  const viewSet = new Set(views.map(v => v.articleId));
  return articleIds.map(id => viewSet.has(id));
}

/**
 * 複数記事の詳細な閲覧情報を一括取得
 * 閲覧時刻と既読時刻を含む詳細情報を取得
 */
export async function batchGetDetailedViews(
  userId: string,
  articleIds: string[]
): Promise<Map<string, ArticleView>> {
  if (articleIds.length === 0) {
    return new Map();
  }

  const views = await prisma.articleView.findMany({
    where: {
      userId,
      articleId: { in: articleIds }
    }
  });

  const viewMap = new Map<string, ArticleView>();
  views.forEach(view => {
    viewMap.set(view.articleId, view);
  });

  return viewMap;
}

/**
 * 複数記事の詳細なお気に入り情報を一括取得
 * お気に入り登録時刻を含む詳細情報を取得
 */
export async function batchGetDetailedFavorites(
  userId: string,
  articleIds: string[]
): Promise<Map<string, Favorite>> {
  if (articleIds.length === 0) {
    return new Map();
  }

  const favorites = await prisma.favorite.findMany({
    where: {
      userId,
      articleId: { in: articleIds }
    }
  });

  const favoriteMap = new Map<string, Favorite>();
  favorites.forEach(favorite => {
    favoriteMap.set(favorite.articleId, favorite);
  });

  return favoriteMap;
}

/**
 * お気に入りと閲覧状態を一括で取得
 * 複数のクエリを並列実行して効率化
 */
export async function batchGetUserStates(
  userId: string,
  articleIds: string[]
): Promise<{
  favorites: Map<string, Favorite>;
  views: Map<string, ArticleView>;
}> {
  if (articleIds.length === 0) {
    return {
      favorites: new Map(),
      views: new Map()
    };
  }

  const [favorites, views] = await Promise.all([
    batchGetDetailedFavorites(userId, articleIds),
    batchGetDetailedViews(userId, articleIds)
  ]);

  return { favorites, views };
}