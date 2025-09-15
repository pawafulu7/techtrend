/**
 * Playwright Test Helpers and Type Definitions
 * E2Eテスト用の型定義とヘルパー関数
 */

import { Page, Locator, BrowserContext } from '@playwright/test';

// Playwright拡張型
export interface ExtendedPage extends Page {
  waitForArticles(): Promise<void>;
  getFirstArticle(): Promise<Locator>;
  scrollToBottom(): Promise<void>;
  checkScrollability(selector: string): Promise<boolean>;
}

// テストコンテキスト拡張
export interface TestContext {
  page: Page;
  context: BrowserContext;
  baseURL: string;
}

// 記事セレクター定義
export const ARTICLE_SELECTORS = {
  card: '[data-testid="article-card"]',
  title: '[data-testid="article-title"]',
  summary: '[data-testid="article-summary"]',
  link: 'a[href*="/articles/"]',
  fallback: 'div.cursor-pointer',
} as const;

// ページセレクター定義
export const PAGE_SELECTORS = {
  main: 'main',
  container: '.container',
  content: '.main-content',
  header: 'header',
  footer: 'footer',
  navigation: 'nav',
  loading: '[data-testid="loading"]',
  error: '[data-testid="error"]',
} as const;

// スクロール関連セレクター
export const SCROLL_SELECTORS = {
  scrollable: ['main', '.main-content', '#main', '[role="main"]', 'div.container'],
  detailedSummary: '[data-testid="detailed-summary"]',
  scrollContainer: '.scroll-container',
} as const;

/**
 * 記事要素を取得するヘルパー関数
 */
export async function findArticleElement(page: Page): Promise<Locator | null> {
  for (const selector of Object.values(ARTICLE_SELECTORS)) {
    const element = page.locator(selector).first();
    if (await element.count() > 0) {
      return element;
    }
  }
  return null;
}

/**
 * スクロール可能な要素を取得
 */
export async function findScrollableElement(page: Page): Promise<Locator | null> {
  for (const selector of SCROLL_SELECTORS.scrollable) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        return element;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * 要素がスクロール可能かチェック
 */
export async function isScrollable(element: Locator): Promise<boolean> {
  const overflow = await element.evaluate((el) => {
    const styles = window.getComputedStyle(el);
    return {
      overflow: styles.overflow,
      overflowY: styles.overflowY,
      height: el.scrollHeight > el.clientHeight,
    };
  });
  
  return (
    overflow.height &&
    (overflow.overflow === 'auto' || 
     overflow.overflow === 'scroll' ||
     overflow.overflowY === 'auto' ||
     overflow.overflowY === 'scroll')
  );
}

/**
 * ページの読み込み完了を待つ
 */
export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  // ローディング要素が消えるまで待つ
  const loading = page.locator(PAGE_SELECTORS.loading);
  if (await loading.count() > 0) {
    await loading.waitFor({ state: 'hidden', timeout: 30000 });
  }
}

/**
 * 記事リストの読み込みを待つ
 */
export async function waitForArticles(page: Page, minCount: number = 1): Promise<void> {
  await waitForPageReady(page);
  
  // 記事が表示されるまで待つ
  let found = false;
  for (const selector of Object.values(ARTICLE_SELECTORS)) {
    const count = await page.locator(selector).count();
    if (count >= minCount) {
      found = true;
      break;
    }
  }
  
  if (!found) {
    throw new Error(`No articles found on the page (expected at least ${minCount})`);
  }
}

/**
 * スクロール位置を取得
 */
export async function getScrollPosition(page: Page, selector?: string): Promise<{ x: number; y: number }> {
  if (selector) {
    return await page.locator(selector).evaluate((el) => ({
      x: el.scrollLeft,
      y: el.scrollTop,
    }));
  }
  
  return await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
  }));
}

/**
 * 要素までスクロール
 */
export async function scrollToElement(page: Page, locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500); // スクロールアニメーション待ち
}

/**
 * ページ下部までスクロール
 */
export async function scrollToBottom(page: Page, selector?: string): Promise<void> {
  if (selector) {
    await page.locator(selector).evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
  } else {
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
  }
  await page.waitForTimeout(500);
}

/**
 * 無限スクロールの次ページ読み込みを待つ
 */
export async function waitForInfiniteScroll(page: Page, _initialCount: number): Promise<number> {
  await scrollToBottom(page);
  await page.waitForTimeout(1000); // API呼び出し待ち
  
  // 新しい記事が読み込まれたかチェック
  let newCount = 0;
  for (const selector of Object.values(ARTICLE_SELECTORS)) {
    const count = await page.locator(selector).count();
    if (count > newCount) {
      newCount = count;
    }
  }
  
  return newCount;
}

// テスト用のモックコンテキスト作成
export function createMockContext(overrides?: Partial<TestContext>): TestContext {
  return {
    page: {} as Page,
    context: {} as BrowserContext,
    baseURL: 'http://localhost:3000',
    ...overrides,
  };
}