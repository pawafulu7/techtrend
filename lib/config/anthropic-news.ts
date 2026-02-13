/**
 * Anthropic News Fetcher Configuration
 * anthropic.com/news のスクレイピング設定
 */
export const anthropicNewsConfig = {
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
    'www.anthropic.com',
    'anthropic.com',
    'images.ctfassets.net',
    'cdn.sanity.io',
  ] as const,

  /** 許可された記事URLホスト */
  allowedArticleHosts: ['www.anthropic.com', 'anthropic.com'] as const,

  /** URL最大長 */
  maxUrlLength: 2048,
};
