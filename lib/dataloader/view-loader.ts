import DataLoader from 'dataloader';
import { prisma } from '@/lib/prisma';
import type { ArticleView } from '@prisma/client';
import type { ViewStatus, LoaderOptions } from './types';

/**
 * 閲覧状態をバッチで取得するDataLoaderを作成
 * ユーザーごとにインスタンスを作成し、記事IDに対する閲覧・既読状態を効率的に取得
 *
 * @param userId - 閲覧状態を確認するユーザーのID
 * @param options - DataLoaderのオプション設定
 */
export function createViewLoader(userId: string, options?: LoaderOptions) {
  return new DataLoader<string, ViewStatus>(
    async (articleIds: readonly string[]) => {
      // ユーザーの閲覧記録を一括取得
      const views = await prisma.articleView.findMany({
        where: {
          userId,
          articleId: {
            in: articleIds as string[]
          }
        }
      });

      // 高速検索用のMapを作成
      const viewMap = new Map<string, ArticleView>();
      views.forEach(view => {
        viewMap.set(view.articleId, view);
      });

      // DataLoaderの順序要件を満たすため、入力順序で結果を返す
      return articleIds.map(articleId => {
        const view = viewMap.get(articleId);
        return {
          articleId,
          isViewed: !!view,
          isRead: view?.isRead ?? false,
          viewedAt: view?.viewedAt,
          readAt: view?.readAt
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