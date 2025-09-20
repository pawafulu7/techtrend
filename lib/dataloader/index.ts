import { createArticleLoader } from './article-loader';
import { createFavoriteLoader } from './favorite-loader';
import { createViewLoader } from './view-loader';
import type { LoaderContext } from './types';

/**
 * DataLoaderインスタンスを作成するファクトリー関数
 * リクエスト単位でインスタンスを作成し、キャッシュを共有する
 */
export function createLoaders(context?: LoaderContext) {
  return {
    article: createArticleLoader(),
    favorite: context?.userId ? createFavoriteLoader(context.userId) : null,
    view: context?.userId ? createViewLoader(context.userId) : null,
  };
}

export type DataLoaders = ReturnType<typeof createLoaders>;

// 型と個別loaderを再エクスポート
export * from './types';
export { createArticleLoader } from './article-loader';
export { createFavoriteLoader } from './favorite-loader';
export { createViewLoader } from './view-loader';