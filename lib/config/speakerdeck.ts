/**
 * Speaker Deck フェッチャーの設定
 */
export const speakerDeckConfig = {
  // フィルタリング設定
  minViews: 300,            // 最小views数（300以上のみ取得）
  maxAge: 365,               // 最大日数（1年以内の記事のみ）
  
  // 取得設定
  maxArticles: 100,          // 最大取得件数（全カテゴリー合計）
  maxPages: 10,              // 最大ページ数（安全のため）
  articlesPerPage: 18,       // 1ページあたりの記事数（参考値）
  
  // パフォーマンス設定
  parallelLimit: 5,          // 並列処理数（個別ページ取得時）
  retryLimit: 2,             // リトライ回数
  requestDelay: 1500,        // リクエスト間隔（ミリ秒）※レート制限対策で増加
  timeout: 10000,            // タイムアウト（ミリ秒）
  
  // 機能フラグ
  enableRSSFeeds: false,     // RSSフィードを使用するか（日付・views取得不可のため無効化）
  enableDetailFetch: true,   // 個別ページから詳細情報を取得するか
  
  // デバッグ
  debug: false,              // デバッグログを出力するか
  
  // カテゴリー設定（新規追加）
  categories: [
    { 
      name: 'programming', 
      path: 'programming',
      enabled: true,
      weight: 1  // 取得の重み付け（将来の拡張用）
    },
    { 
      name: 'technology', 
      path: 'technology',
      enabled: true,
      weight: 1
    },
    { 
      name: 'how-to-diy', 
      path: 'how-to-diy',
      enabled: true,
      weight: 1
    }
  ],
  maxArticlesPerCategory: 35,  // 各カテゴリーからの最大取得数
};