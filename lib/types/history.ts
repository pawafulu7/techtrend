/**
 * 閲覧履歴関連の型定義
 */

/**
 * 閲覧履歴アイテムの型
 */
export interface HistoryViewItem {
  viewedAt: string | null;
  article: HistoryArticle;
}

/**
 * 閲覧履歴に表示する記事の型
 * IDはPrismaのcuid()に合わせてstring
 */
export interface HistoryArticle {
  id: string;
  viewId: string;
  title: string;
  translatedTitle?: string | null;
  summary: string | null;
  url: string;
  publishedAt: string;
  source: {
    id: string;
    name: string;
  };
  companyName?: string | null;
  tags?: Array<{
    id: string;
    name: string;
  }>;
  contentLength?: number;
  content?: string | null;
}
