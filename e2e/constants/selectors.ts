/**
 * E2Eテスト用セレクター定数
 *
 * 命名規則:
 * - 大文字のスネークケースを使用
 * - カテゴリーごとにグループ化
 * - **data-testid プライマリ**（Issue #611 で class 依存セレクタを全廃）
 *
 * testid 命名規則の詳細は `e2e/testid-naming.md` を参照。
 *
 * Fallback として使用してよいもの:
 * - ARIA role / live region (`role="alert"`, `role="status"`)
 * - Semantic HTML タグ (`time`, `nav` 等)
 * - 安定した URL prefix (`a[href*="..."]`)
 * - 安定した属性 (`select[name="..."]`, `input[type="..."]`)
 *
 * 使用禁止:
 * - Tailwind utility class 直接指定 (`.text-red-500` 等)
 * - class substring セレクタ (`[class*="..."]`)
 */

export const SELECTORS = {
  // ===== 共通要素 =====
  MAIN_CONTENT: 'main',
  BODY: 'body',
  // Loading: Issue #611 で LOADING_INDICATOR と LOADING_SPINNER を 1 エントリに統合
  LOADING_SPINNER: '[data-testid="loading-spinner"]',
  ERROR_MESSAGE: '[data-testid="error-message"], [role="alert"]',
  EMPTY_STATE: '[data-testid="empty-state"]',
  SUCCESS_MESSAGE: '[data-testid="success-message"], [role="status"], [aria-live="polite"]',

  // ===== ナビゲーション =====
  NAV_MENU: 'nav[role="navigation"]',
  THEME_TOGGLE: '[data-testid="theme-toggle-button"]',
  THEME_DROPDOWN: '[data-testid="theme-dropdown"]',
  THEME_OPTION_LIGHT: '[data-testid="theme-option-light"]',
  THEME_OPTION_DARK: '[data-testid="theme-option-dark"]',
  THEME_OPTION_SYSTEM: '[data-testid="theme-option-system"]',

  // ===== 記事カード =====
  ARTICLE_CARD: '[data-testid="article-card"]',
  ARTICLE_LINK: '[data-testid="article-card"] a',
  ARTICLE_TITLE: '[data-testid="article-title"]',
  ARTICLE_SUMMARY: '[data-testid="article-summary"]',
  // ARTICLE_CONTENT は ARTICLE_CARD のエイリアス（記事カード全体を指す）。
  // 記事本文専用の要素が必要になったら別 testid (例: article-card-content) を新設すること。
  ARTICLE_CONTENT: '[data-testid="article-card"]',
  ARTICLE_DATE: '[data-testid="article-date"]',
  ARTICLE_SOURCE: '[data-testid="article-source"]',
  ARTICLE_TAGS: '[data-testid="tag-item"]',

  // ===== 検索 =====
  SEARCH_INPUT: '[data-testid="search-box-input"]',
  SEARCH_RESULTS: '[data-testid="search-results"]',
  SEARCH_RESULT_COUNT: '[data-testid="search-result-count"]',
  SEARCH_RESULT_TEXT: '[data-testid="search-result-text"]',
  SOURCE_FILTER: '[data-testid="source-filter"], [data-testid="source-dropdown"], select[name="source"]',
  DATE_FILTER: '[data-testid="date-filter"], input[type="date"]',
  SORT_SELECT: '[data-testid="sort-dropdown"], [data-testid="sort"], select[name="sort"]',

  // ===== ページネーション =====
  PAGINATION: '[data-testid="pagination-container"]',
  PAGINATION_PREV: '[data-testid="pagination-prev"]',
  PAGINATION_NEXT: '[data-testid="pagination-next"]',
  PAGINATION_CURRENT: '[data-testid="pagination-current"]',
  NEXT_PAGE_BUTTON: '[data-testid="pagination-next"]',
  PREV_PAGE_BUTTON: '[data-testid="pagination-prev"]',

  // ===== お気に入り・リーディングリスト =====
  // Issue #611 注: data-testid*= substring マッチの精密化は Issue #619 で追跡
  FAVORITE_BUTTON: '[data-testid*="favorite"], button[aria-label*="お気に入り"], button[aria-label*="favorite"]',
  READING_LIST_BUTTON: '[data-testid="reading-list"], button[aria-label*="リーディングリスト"]',

  // ===== 外部リンク =====
  SOURCE_LINK: '[data-testid="source-link"], a[target="_blank"]',
  EXTERNAL_LINK: 'a[rel*="noopener"], a[rel*="external"]',

  // ===== 関連記事 =====
  RELATED_SECTION: '[data-testid="related-articles"]',
  // RELATED_SECTION 配下の記事カードに限定（ホーム/一覧の記事カードと混ざらないようスコープを絞る）
  RELATED_ARTICLES: '[data-testid="related-articles"] [data-testid="article-card"]',

  // ===== 分析ページ =====
  ANALYTICS_CONTENT: '[data-testid="analytics-content"]',
  STATS_CARDS: '[data-testid="stat-card"]',
  STATS_VALUE: '[data-testid="stats-value"]',
  CHART_CONTAINER: '[data-testid="chart-container"]',
  PERIOD_FILTER: '[data-testid="period-filter"], select[name="period"], select[name="range"]',

  // ===== タグ関連 =====
  TAG_CLOUD: '[data-testid="tag-cloud"]',
  TAG_ITEM: '[data-testid="tag-item"]',

  // ===== エクスポート =====
  EXPORT_BUTTON: 'button:has-text("エクスポート"), button:has-text("Export"), button:has-text("ダウンロード")',

  // ===== レスポンシブ =====
  MOBILE_MENU: '[data-testid="mobile-menu"], button[aria-label*="メニュー"]',
} as const;

// セレクタータイプの定義
export type SelectorKey = keyof typeof SELECTORS;

// ヘルパー関数
export const getSelector = (key: SelectorKey): string => {
  return SELECTORS[key];
};

// 複数のセレクターを試すヘルパー
export const trySelectors = (...keys: SelectorKey[]): string => {
  return keys.map(key => SELECTORS[key]).join(', ');
};
