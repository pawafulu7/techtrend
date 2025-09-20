import DataLoader from 'dataloader';
import { prisma } from '@/lib/prisma';
import type { Favorite } from '@prisma/client';
import type { FavoriteStatus, LoaderOptions } from './types';

/**
 * お気に入り状態をバッチで取得するDataLoaderを作成
 * ユーザーごとにインスタンスを作成し、記事IDに対するお気に入り状態を効率的に取得
 *
 * @param userId - お気に入り状態を確認するユーザーのID
 * @param options - DataLoaderのオプション設定
 */
export function createFavoriteLoader(userId: string, options?: LoaderOptions) {
  return new DataLoader<string, FavoriteStatus>(
    async (articleIds: readonly string[]) => {
      // ユーザーのお気に入りを一括取得
      const favorites = await prisma.favorite.findMany({
        where: {
          userId,
          articleId: {
            in: articleIds as string[]
          }
        }
      });

      // 高速検索用のMapを作成
      const favoriteMap = new Map<string, Favorite>();
      favorites.forEach(favorite => {
        favoriteMap.set(favorite.articleId, favorite);
      });

      // DataLoaderの順序要件を満たすため、入力順序で結果を返す
      return articleIds.map(articleId => {
        const favorite = favoriteMap.get(articleId);
        return {
          articleId,
          isFavorited: !!favorite,
          favoritedAt: favorite?.createdAt
        };
      });
    },
    {
      cache: options?.cache !== false, // デフォルトでキャッシュ有効
      maxBatchSize: options?.maxBatchSize || Infinity,
      batchScheduleFn: options?.batchScheduleFn,
    }
  );
}