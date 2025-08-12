/**
 * E2Eテスト用セレクター定数
 * 
 * 命名規則:
 * - 大文字のスネークケースを使用
 * - カテゴリーごとにグループ化
 * - 可能な限り data-testid を優先
 */

export const SELECTORS = {
  // ===== 共通要素 =====
  MAIN_CONTENT: 'main',
  BODY: 'body',
  LOADING_INDICATOR: 'main .animate-spin, main [class*="loader"]',
  LOADING_SPINNER: '[class*="loading"], [class*="spinner"]',
  ERROR_MESSAGE: '[class*="error"], [class*="404"], [class*="not-found"]',
  
  // ===== ナビゲーション =====
  NAV_MENU: 'nav[role="navigation"]',
  THEME_TOGGLE: '[data-testid="theme-toggle"]',
  
  // ===== 記事カード =====
  ARTICLE_CARD: 'article, [class*="article"], [class*="card"]',
  ARTICLE_LINK: 'article a, [class*="article"] a, [class*="card"] a',
  ARTICLE_TITLE: 'h1, h2, h3, [class*="title"]',
  ARTICLE_SUMMARY: 'p.text-sm, [class*="summary"]',
  ARTICLE_CONTENT: 'article, [class*="content"], [class*="body"]',
  ARTICLE_DATE: 'time, [class*="date"], [class*="published"]',
  ARTICLE_SOURCE: '[class*="source"], [data-testid="source"]',
  ARTICLE_TAGS: '[class*="tag"], [data-testid="tag"]',
  
  // ===== 検索 =====
  SEARCH_INPUT: 'input[type="text"][placeholder*="キーワードで記事を検索"]',
  SEARCH_RESULTS: '[data-testid="search-results"]',
  SEARCH_RESULT_COUNT: 'p:has-text("件")',
  SOURCE_FILTER: 'select[name*="source"], select[data-testid="source-filter"], [data-testid="source-dropdown"]',
  DATE_FILTER: 'select[name*="date"], input[type="date"], [data-testid="date-filter"]',
  SORT_SELECT: 'select[name*="sort"], select[data-testid="sort"], [data-testid="sort-dropdown"]',
  
  // ===== ページネーション =====
  PAGINATION: '[data-testid="pagination"], nav[aria-label*="pagination"], .pagination',
  NEXT_PAGE_BUTTON: 'button:has-text("次"), button:has-text("Next"), [aria-label*="次"]',
  PREV_PAGE_BUTTON: 'button:has-text("前"), button:has-text("Previous"), [aria-label*="前"]',
  
  // ===== お気に入り・リーディングリスト =====
  FAVORITE_BUTTON: '[data-testid*="favorite"], button[aria-label*="お気に入り"], button[aria-label*="favorite"]',
  READING_LIST_BUTTON: '[data-testid="reading-list"], button[aria-label*="リーディングリスト"]',
  
  // ===== 外部リンク =====
  SOURCE_LINK: 'a[href*="http"], a[target="_blank"], [data-testid="source-link"]',
  EXTERNAL_LINK: 'a[rel*="noopener"], a[rel*="external"]',
  
  // ===== 関連記事 =====
  RELATED_SECTION: 'section:has-text("関連"), section:has-text("Related"), [data-testid="related-articles"]',
  RELATED_ARTICLES: 'article, [class*="card"]',
  
  // ===== 分析ページ =====
  ANALYTICS_CONTENT: '[class*="analytics"], [class*="stats"], [data-testid="analytics"]',
  STATS_CARDS: '[class*="stat"], [class*="metric"], [data-testid="stat-card"]',
  STATS_VALUE: '[class*="value"], [class*="number"], span',
  CHART_CONTAINER: '[class*="chart"], canvas, svg',
  PERIOD_FILTER: 'select[name*="period"], select[name*="range"], [data-testid="period-filter"]',
  
  // ===== タグ関連 =====
  TAG_CLOUD: '[class*="tag-cloud"], [data-testid="tag-cloud"]',
  TAG_ITEM: '[class*="tag"], a[href*="tag"], [data-testid="tag"]',
  
  // ===== エクスポート =====
  EXPORT_BUTTON: 'button:has-text("エクスポート"), button:has-text("Export"), button:has-text("ダウンロード")',
  
  // ===== レスポンシブ =====
  MOBILE_MENU: '[data-testid="mobile-menu"], button[aria-label*="メニュー"]',
  MOBILE_VIEWPORT: '[class*="mobile"], [class*="sm:"]',
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