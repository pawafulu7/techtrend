import { Page, expect } from '@playwright/test';
import { SELECTORS } from '../constants/selectors';

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Test user configuration
export const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User',
  password: 'TestPassword123',
};

// Browser-specific test users (for parallel testing)
// Use worker index from environment to ensure uniqueness
export const TEST_USERS = {
  chromium: { 
    ...TEST_USER, 
    email: process.env.TEST_PARALLEL_INDEX 
      ? `test-chromium-${process.env.TEST_PARALLEL_INDEX}@example.com`
      : TEST_USER.email
  },
  firefox: { 
    ...TEST_USER, 
    email: process.env.TEST_PARALLEL_INDEX 
      ? `test-firefox-${process.env.TEST_PARALLEL_INDEX}@example.com`
      : 'test-firefox@example.com' 
  },
  webkit: { 
    ...TEST_USER, 
    email: process.env.TEST_PARALLEL_INDEX 
      ? `test-webkit-${process.env.TEST_PARALLEL_INDEX}@example.com`
      : 'test-webkit@example.com' 
  },
};

/**
 * ページの読み込みが完了するまで待機
 * 注: 開発サーバーは常時起動（http://localhost:3000）
 */
export async function waitForPageLoad(page: Page, options: { timeout?: number } = {}) {
  const { timeout = 30000 } = options;
  
  // Wait for network idle and main content to be visible
  await page.waitForLoadState('networkidle', { timeout });
  
  // Wait for main content area to be visible
  const mainContent = page.locator('main, [role="main"], #__next, #root').first();
  if (await mainContent.count() > 0) {
    await mainContent.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
      // Fallback if main content selector doesn't exist
    });
  }
}

/**
 * 要素が表示されるまで待機
 */
export async function waitForElement(page: Page, selector: string, timeout = 10000) {
  await page.waitForSelector(selector, { state: 'visible', timeout });
}

/**
 * 記事カードが存在することを確認
 */
export async function expectArticleCards(page: Page, minCount = 1) {
  // 記事要素を探す（data-testidを最優先、ない場合は代替セレクタを使用）
  const articles = page.locator('[data-testid="article-card"], article, [class*="article"], [class*="card"]');
  const count = await articles.count();
  expect(count).toBeGreaterThanOrEqual(minCount);
}

/**
 * ナビゲーションメニューが存在することを確認
 */
export async function expectNavigationMenu(page: Page) {
  // ナビゲーションメニューを特定（複数のnav要素があるため最初のものを選択）
  const nav = page.locator('nav').first();
  await expect(nav).toBeVisible();
  
  // ナビゲーションリンクの存在確認（リンクが存在する場合のみ）
  const homeLink = nav.locator('a[href="/"]');
  if (await homeLink.count() > 0) {
    await expect(homeLink.first()).toBeVisible();
  }
  
  const sourcesLink = nav.locator('a[href="/sources"]');
  if (await sourcesLink.count() > 0) {
    await expect(sourcesLink.first()).toBeVisible();
  }
}

/**
 * ページタイトルを検証
 */
export async function expectPageTitle(page: Page, expectedTitle: string | RegExp) {
  if (typeof expectedTitle === 'string') {
    await expect(page).toHaveTitle(new RegExp(escapeRegex(expectedTitle), 'i'));
  } else {
    await expect(page).toHaveTitle(expectedTitle);
  }
}

/**
 * URLパスを検証（パス部分のみを厳密に比較）
 */
export async function expectUrlPath(page: Page, expectedPath: string | RegExp) {
  if (typeof expectedPath === 'string') {
    // Extract pathname for strict matching
    const currentUrl = new URL(page.url());
    expect(currentUrl.pathname).toBe(expectedPath);
  } else {
    await expect(page).toHaveURL(expectedPath);
  }
}

/**
 * エラーメッセージが表示されていないことを確認
 */
export async function expectNoErrors(page: Page) {
  const errorMessages = page.locator('[data-testid="error-message"]');
  await expect(errorMessages).toHaveCount(0);
}

/**
 * ローディング状態が終了するまで待機
 */
export async function waitForLoadingComplete(page: Page) {
  // ローディングインジケーターが消えるまで待機
  const loading = page.locator('[data-testid="loading"]');
  await expect(loading).toBeHidden({ timeout: 10000 });
}

/**
 * データ読み込み完了を待つ
 * ローディング表示が消え、データ表示要素が現れるまで待機
 */
export async function waitForDataLoad(page: Page, timeout = 10000) {
  // Wait for loading indicator to disappear
  const loadingIndicator = page.locator('.loading, .animate-spin, [class*="loader"]');
  await expect(loadingIndicator).toBeHidden({ timeout: timeout / 2 });
  
  // Wait for data content to appear
  const dataContent = page.locator('[data-loaded="true"], main [class*="card"], main article').first();
  await expect(dataContent).toBeVisible({ timeout: timeout / 2 });
}

/**
 * APIレスポンスを待つ
 * 指定したURLパターンに一致するAPIレスポンスを待機
 */
export async function waitForApiResponse(
  page: Page, 
  urlPattern: string | RegExp,
  timeout = 10000
) {
  return page.waitForResponse(
    response => {
      const url = response.url();
      const isMatch = typeof urlPattern === 'string' 
        ? url.includes(urlPattern)
        : urlPattern.test(url);
      return isMatch && response.status() === 200;
    },
    { timeout }
  );
}

/**
 * 要素のテキスト変更を待つ
 * 指定したセレクターの要素のテキストが期待値に変わるまで待機
 */
export async function waitForTextChange(
  page: Page,
  selector: string,
  expectedText: string | RegExp,
  timeout = 5000
) {
  await page.waitForFunction(
    ({ selector, expected }) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const text = element.textContent || '';
      
      if (expected.kind === 'string') {
        return text.includes(expected.value);
      } else {
        const re = new RegExp(expected.source, expected.flags || '');
        return re.test(text);
      }
    },
    {
      selector,
      expected: expectedText instanceof RegExp
        ? { kind: 'regex', source: expectedText.source, flags: expectedText.flags || '' }
        : { kind: 'string', value: expectedText }
    },
    { timeout }
  );
}

/**
 * 要素のテキストコンテンツを待つ
 * 指定したセレクターの要素にテキストが表示されるまで待機
 */
export async function waitForElementTextContent(
  page: Page,
  selector: string,
  timeout = 5000
) {
  await page.waitForFunction(
    (selector) => {
      const element = document.querySelector(selector);
      return element && element.textContent && element.textContent.trim().length > 0;
    },
    selector,
    { timeout }
  );
}

/**
 * ローディング表示が消えるまで待つ
 * 汎用的なローディングインジケーターが非表示になるまで待機
 */
export async function waitForLoadingToDisappear(page: Page, timeout = 10000) {
  // SELECTORSから定義されたローディングインジケーターを使用
  const loadingIndicator = page.locator(SELECTORS.LOADING_INDICATOR);
  
  // すべてのローディングインジケーターが非表示になるまで待つ
  await expect(loadingIndicator).toBeHidden({ timeout });
}

/**
 * 検索結果の表示を待つ
 * 検索実行後、結果が表示されるまで待機
 */
export async function waitForSearchResults(page: Page, timeout = 30000) {
  // まずローディングインジケーターが消えるのを待つ
  await waitForLoadingToDisappear(page, timeout / 2);
  
  // 検索結果のテキストまたは記事カードが表示されるのを待つ
  await page.waitForFunction(
    () => {
      // ローディング状態でないことを確認
      const loader = document.querySelector('.animate-spin, [class*="loader"]');
      if (loader) return false;
      
      // 検索結果のテキストまたは記事カードを確認
      const resultText = document.querySelector('p');
      const hasResultText = resultText && (
        resultText.textContent?.includes('件') || 
        resultText.textContent?.includes('結果') ||
        resultText.textContent?.includes('No results') ||
        resultText.textContent?.includes('記事が見つかりませんでした')
      );
      
      // 記事カードの存在も確認
      const articleCards = document.querySelectorAll('[data-testid="article-card"]');
      
      // いずれかの条件を満たせばOK
      return hasResultText || articleCards.length > 0;
    },
    { timeout }
  );
  
  // 追加の安定化待機
  await page.waitForTimeout(500);
}

/**
 * Test user login helper
 * @param page - Playwright page object
 * @param options - Login options
 * @returns true if login successful, false otherwise
 */
export async function loginTestUser(
  page: Page,
  options: { debug?: boolean } = {}
): Promise<boolean> {
  const { debug = false } = options;
  
  try {
    if (debug) console.log('Navigating to login page...');
    
    // Navigate to login page
    await page.goto('/auth/login');
    await waitForPageLoad(page);
    
    // Fill in credentials
    await page.fill('input[id="email"]', TEST_USER.email);
    await page.fill('input[id="password"]', TEST_USER.password);
    
    if (debug) console.log('Submitting login form...');
    
    // Submit login
    await page.click('button[type="submit"]:has-text("ログイン")');
    
    // Wait for navigation
    await page.waitForURL('/', { timeout: 10000 });
    
    if (debug) console.log('Login successful!');
    
    return true;
  } catch (error) {
    if (debug) console.error('Login failed:', error);
    return false;
  }
}