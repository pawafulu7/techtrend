/**
 * 閲覧履歴関連の型定義
 */

/**
 * 閲覧履歴アイテムの型
 */
export interface HistoryViewItem {
  viewedAt: string;
  article: HistoryArticle;
}

/**
 * 閲覧履歴に表示する記事の型
 */
export interface HistoryArticle {
  id: number;
  viewId: number;
  title: string;
  translatedTitle?: string | null;
  summary: string | null;
  url: string;
  publishedAt: string;
  source: {
    id: number;
    name: string;
  };
  companyName?: string | null;
  tags?: Array<{
    id: number;
    name: string;
  }>;
  contentLength?: number;
  content?: string | null;
}
