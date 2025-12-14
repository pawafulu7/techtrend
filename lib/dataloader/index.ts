import { createArticleLoader } from './article-loader';
import { createFavoriteLoader } from './favorite-loader';
import { createArticleViewLoader } from './article-view-loader';
import type { LoaderContext, LoaderOptions } from './types';

/**
 * DataLoaderインスタンスを作成するファクトリー関数
 * リクエスト単位でインスタンスを作成し、キャッシュを共有する
 */
export function createLoaders(
  context?: LoaderContext,
  options?: { favorite?: LoaderOptions; view?: LoaderOptions; article?: LoaderOptions }
) {
  return {
    article: createArticleLoader(),
    favorite: context?.userId ? createFavoriteLoader(context.userId, options?.favorite) : null,
    view: context?.userId ? createArticleViewLoader(context.userId, options?.view) : null,
  };
}

export type DataLoaders = ReturnType<typeof createLoaders>;

// 型と個別loaderを再エクスポート
export * from './types';
export { createArticleLoader } from './article-loader';
export { createFavoriteLoader } from './favorite-loader';
export { createArticleViewLoader } from './article-view-loader';
