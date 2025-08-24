/**
 * Docswell Fetcher Configuration
 * スライド共有サイトDocswell.comからの記事取得設定
 */

export const docswellConfig = {
  // フィルタリング設定
  // minViews: 100,         // 最小閲覧数（トレンドページ使用のため無効化）
  maxAge: 30,               // 最大日数（30日以内）
  
  // 取得設定
  maxArticles: 30,          // 最大取得件数
  
  // パフォーマンス設定
  requestDelay: 1500,       // リクエスト間隔（ミリ秒）
  timeout: 10000,           // タイムアウト（ミリ秒）
  retryLimit: 2,            // リトライ回数
  
  // 機能フラグ
  enableRSSFallback: false, // RSS フォールバック無効（トレンドページをメイン使用）
  debug: false,             // デバッグログ出力
};