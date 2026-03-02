export const SITE_NAME = 'TechTrend';
export const SITE_DESCRIPTION = '最新テックトレンドを一括収集・表示';

// ページネーション関連
export const PAGINATION = {
  /** 1ページあたりの表示記事数 */
  ITEMS_PER_PAGE: 20,
  /** スクロール復元時の最大プリフェッチページ数（UX/パフォーマンス観点の上限） */
  MAX_PREFETCH_PAGES: 10,
} as const;

// 互換性レイヤー（将来的に削除予定）
/**
 * @deprecated 直接参照は避け、PAGINATION.ITEMS_PER_PAGE を使用してください。
 *             v2.0.0で削除予定。
 */
export const ARTICLES_PER_PAGE = PAGINATION.ITEMS_PER_PAGE;

// タイムアウト関連
export const TIMEOUTS = {
  /** スクロール復元リトライの最大試行回数 */
  SCROLL_RESTORE_MAX_ATTEMPTS: 12,
  /** スクロール復元リトライ間隔（ミリ秒） */
  SCROLL_RESTORE_RETRY_INTERVAL: 100,
  /** スクロール復元後のUI非表示遅延（ミリ秒） */
  SCROLL_RESTORE_UI_DELAY: 700,
  /** ページフェッチ後の待機時間（ミリ秒） */
  PAGE_FETCH_WAIT: 100,
} as const;

// スクロール関連
export const SCROLL = {
  /** スクロール保存のしきい値（px） */
  MIN_SCROLL_SAVE_THRESHOLD: 50,
  /** スクロール復元データの有効期限（ms） */
  RESTORE_DATA_EXPIRY_MS: 30 * 60 * 1000, // 30分
  /** スクロール復元データの有効期限（分） @deprecated RESTORE_DATA_EXPIRY_MSを使用してください */
  RESTORE_DATA_EXPIRY_MINUTES: 30,
  /** ヘッダーオフセット（px） */
  HEADER_OFFSET_PX: 8,
} as const;
export const MAX_SUMMARY_LENGTH = 200;

export const GEMINI_API = {
  MODEL: 'gemini-2.5-flash-lite',
  MAX_TOKENS: 200,
  DETAILED_MAX_TOKENS: 2500, // 詳細要約用の拡張トークン数
  TEMPERATURE: 0.7,
} as const;

export const FETCH_INTERVALS = {
  HATENA: 15 * 60 * 1000, // 15 minutes
  QIITA: 10 * 60 * 1000, // 10 minutes
  ZENN: 20 * 60 * 1000, // 20 minutes
} as const;
