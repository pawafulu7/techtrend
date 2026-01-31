/**
 * Claude Blog Fetcher Configuration
 * claude.com/blog のスクレイピング設定
 */
export const claudeBlogConfig = {
  /** 最大取得記事数 */
  maxArticles: 20,

  /** リクエスト間隔 (ms) */
  requestDelay: 500,

  /** タイムアウト (ms) */
  timeout: 30000,

  /** リトライ上限 */
  retryLimit: 3,

  /** デバッグログ出力 */
  debug: process.env.NODE_ENV === 'development',

  /** 許可されたサムネイルホスト */
  allowedThumbnailHosts: [
    'claude.com',
    'www.anthropic.com',
    'images.ctfassets.net', // Contentful CDN
  ] as const,

  /** 許可された記事URLホスト */
  allowedArticleHosts: ['claude.com'] as const,

  /** 記事セレクタ (フォールバック順) */
  articleSelectors: ['.blog_cms_item', '.card_blog_wrap'] as const,

  /** タイトルセレクタ */
  titleSelector: '.card_blog_title',

  /** 日付フォーマット (フォールバック順) */
  dateFormats: ['MMMM d, yyyy', 'MMM d, yyyy', 'yyyy-MM-dd'] as const,

  /** URL最大長 */
  maxUrlLength: 2048,
};
