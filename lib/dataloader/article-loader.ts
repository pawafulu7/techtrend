import DataLoader from 'dataloader';
import { prisma } from '@/lib/prisma';
import type { ArticleWithRelations, LoaderOptions } from './types';

/**
 * 記事データをバッチで取得するDataLoaderを作成
 * N+1問題を解決し、同一リクエスト内での記事取得を最適化
 */
export function createArticleLoader(options?: LoaderOptions) {
  return new DataLoader<string, ArticleWithRelations | null>(
    async (ids: readonly string[]) => {
      // Prismaで記事を一括取得
      const articles = await prisma.article.findMany({
        where: {
          id: {
            in: ids as string[]
          }
        },
        include: {
          tags: true,
          source: true,
        }
      });

      // IDをキーとしたMapを作成して高速検索
      const articleMap = new Map<string, ArticleWithRelations>();
      articles.forEach(article => {
        articleMap.set(article.id, article as ArticleWithRelations);
      });

      // 元のIDの順序を保持して結果を返す
      // DataLoaderは順序が重要（入力と出力の順序が一致する必要がある）
      return ids.map(id => {
        const article = articleMap.get(id);
        // 記事が見つからない場合はnullを返す（エラーにしない）
        return article || null;
      });
    },
    {
      cache: options?.cache !== false, // デフォルトでキャッシュ有効
      maxBatchSize: options?.maxBatchSize || Infinity, // バッチサイズの上限
      batchScheduleFn: options?.batchScheduleFn, // カスタムバッチスケジューラ
    }
  );
}