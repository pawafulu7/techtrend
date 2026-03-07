import type { ArticleType } from '@/lib/utils/article/article-type-prompts';

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

// Detail API用の型（/api/articles/[id] の全フィールド）
export interface ReaderDetailArticle {
  id: string;
  title: string;
  translatedTitle: string | null;
  url: string;
  summary: string | null;
  detailedSummary: string | null;
  thumbnail: string | null;
  publishedAt: string;
  summaryVersion: number | null;
  articleType: ArticleType | null;
  source: { id: string; name: string; url: string } | null;
  tags: { id: string; name: string }[];
}

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
