// List API用の型（/api/articles/list の軽量レスポンス）
export interface ReaderListArticle {
  id: string;
  title: string;
  translatedTitle: string | null;
  url: string;
  summary: string | null;
  thumbnail: string | null;
  publishedAt: string;
  source: { id: string; name: string } | null;
}

// Detail API用の型（本文で使う項目。サーバーの先読みと共有するので lib に置く）
export type { ReaderDetailArticle } from '@/lib/articles/reader-articles-query';
import type { ReaderDetailArticle } from '@/lib/articles/reader-articles-query';

// API レスポンス型（discriminated union）
export type ArticleListResponse =
  | {
      success: true;
      data: {
        items: ReaderListArticle[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      };
    }
  | { success: false; error: string };

export type ArticleDetailResponse =
  | { success: true; data: ReaderDetailArticle }
  | { success: false; error: string };
