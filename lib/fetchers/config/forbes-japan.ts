/**
 * Forbes Japan AI Fetcher Configuration
 * forbesjapan.com/category/technology_ai のスクレイピング設定
 */
export const forbesJapanConfig = {
  /** 記事一覧ページURL */
  pageUrl: 'https://forbesjapan.com/category/technology_ai',

  /** 記事リンクセレクタ（URLパターン起点。CSSクラス名はNext.jsハッシュ付きで脆弱なため不使用） */
  articleLinkSelector: 'a[href^="/articles/detail/"]',

  /** 許可された記事URLホスト */
  allowedArticleHosts: ['forbesjapan.com', 'www.forbesjapan.com'] as const,

  /** 許可されたサムネイルホスト */
  allowedThumbnailHosts: ['forbesjapan.com', 'www.forbesjapan.com'] as const,

  /** 最大取得記事数 */
  maxArticles: 20,

  /** タイムアウト (ms) */
  timeout: 30000,

  /** リトライ上限 */
  retryLimit: 3,

  /** リクエスト間隔 (ms) */
  requestDelay: 500,

  /** 日付フォーマット（Forbes Japan の表記: 例 "2026.3.2 10:30"） */
  dateFormat: 'yyyy.M.d HH:mm',

  /** URL最大長 */
  maxUrlLength: 2048,

  /** デバッグログ出力 */
  debug: process.env.NODE_ENV === 'development',
};
