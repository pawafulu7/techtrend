import { Article, Tag, Source } from '@prisma/client';

// DataLoaderで使用する拡張型定義
export interface ArticleWithRelations extends Article {
  tags: Tag[];
  source: Source;
}

// バッチ処理の結果型
export interface BatchResult<T> {
  data: T[];
  errors?: Error[];
}

// DataLoaderのキャッシュキー生成用
export interface LoaderContext {
  userId?: string;
  requestId?: string;
}

// お気に入り状態の型
export interface FavoriteStatus {
  articleId: string;
  isFavorited: boolean;
  favoritedAt?: Date;
}

// 閲覧状態の型
export interface ViewStatus {
  articleId: string;
  isViewed: boolean;
  isRead: boolean;
  viewedAt?: Date | null;
  readAt?: Date | null;
}

// DataLoader作成オプション
export interface LoaderOptions {
  cache?: boolean;
  maxBatchSize?: number;
  batchScheduleFn?: (callback: () => void) => void;
}