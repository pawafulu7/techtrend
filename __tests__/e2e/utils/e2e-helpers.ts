import { Page, expect } from '@playwright/test';
import { SELECTORS } from '../constants/selectors';

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Test user configuration (overridable with environment variables)
export const TEST_USER: { id: string; email: string; name: string; password: string } = {
  id: process.env.E2E_TEST_USER_ID ?? 'test-user-id',
  email: process.env.E2E_TEST_USER_EMAIL ?? 'test@example.com',
  name: process.env.E2E_TEST_USER_NAME ?? 'Test User',
  password: process.env.E2E_TEST_USER_PASSWORD ?? 'TestPassword123',
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
  const loading = page.locator(SELECTORS.LOADING_INDICATOR);
  await expect(loading).toBeHidden({ timeout: 10000 });
}

/**
 * データ読み込み完了を待つ
 * ローディング表示が消え、データ表示要素が現れるまで待機
 */
export async function waitForDataLoad(page: Page, timeout = 10000) {
  // Wait for loading indicator to disappear (use common selector)
  const loadingIndicator = page.locator(SELECTORS.LOADING_INDICATOR);
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
      if (!isMatch) return false;
      const status = response.status();
      return status >= 200 && status < 300;
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
    (selectors) => {
      // ローディング状態でないことを確認（共通セレクタ使用）
      const loader = document.querySelector(selectors.loadingIndicator);
      if (loader) return false;
      
      // 検索結果のテキストを確認（共通セレクタ使用）
      const resultText = document.querySelector(selectors.searchResultText);
      const hasResultText = resultText && (
        resultText.textContent?.includes('件') || 
        resultText.textContent?.includes('結果') ||
        resultText.textContent?.includes('No results') ||
        resultText.textContent?.includes('記事が見つかりませんでした')
      );
      
      // 記事カードの存在も確認（共通セレクタ使用）
      const articleCards = document.querySelectorAll('[data-testid="article-card"]');
      
      // いずれかの条件を満たせばOK
      return hasResultText || articleCards.length > 0;
    },
    {
      loadingIndicator: SELECTORS.LOADING_INDICATOR,
      searchResultText: SELECTORS.SEARCH_RESULT_TEXT
    },
    { timeout }
  );
  
  // 追加の安定化待機
  await page.waitForTimeout(500);
}

/**
 * パスワード変更テスト用のユーザー設定
 */
export const TEST_USER_FOR_PASSWORD_CHANGE = {
  ...TEST_USER,
  newPassword: 'NewTestPassword456',
};

/**
 * テストユーザーを作成
 * @param email - ユーザーのメールアドレス
 * @param password - パスワード
 */
export async function createTestUser(email: string, password: string) {
  // Implementation would depend on your API or database setup
  // This is a placeholder for test user creation logic
  console.log(`Creating test user: ${email}`);
}

/**
 * テストユーザーを削除
 * @param email - 削除するユーザーのメールアドレス
 */
export async function deleteTestUser(email: string) {
  // Implementation would depend on your API or database setup
  // This is a placeholder for test user deletion logic
  console.log(`Deleting test user: ${email}`);
}

/**
 * アカウントタブを開く
 * @param page - Playwright page object
 */
export async function openAccountTab(page: Page) {
  await page.click('[data-testid="account-tab"], a[href*="account"], button:has-text("アカウント")');
  await page.waitForTimeout(500);
}

/**
 * パスワード変更フォームを入力
 * @param page - Playwright page object
 * @param currentPassword - 現在のパスワード
 * @param newPassword - 新しいパスワード
 */
export async function fillPasswordChangeForm(
  page: Page, 
  currentPassword: string, 
  newPassword: string
) {
  // Use .first() instead of :first pseudo-class for better compatibility
  const currentPasswordInput = page.locator('input[name="currentPassword"], input[type="password"]').first();
  await currentPasswordInput.fill(currentPassword);
  
  await page.fill('input[name="newPassword"], input[placeholder*="新しいパスワード"]', newPassword);
  await page.fill('input[name="confirmPassword"], input[placeholder*="確認"]', newPassword);
}

/**
 * エラーメッセージが表示されるまで待つ
 * @param page - Playwright page object
 * @param message - 期待するエラーメッセージ（部分一致）
 * @param timeout - タイムアウト時間（ミリ秒）
 */
export async function waitForErrorMessage(
  page: Page, 
  message: string, 
  timeout = 5000
) {
  // Use locator with hasText filter to handle messages with quotes safely
  const errorLocator = page.locator('[class*="error"]').filter({ hasText: message });
  await errorLocator.waitFor({ state: 'visible', timeout });
}

/**
 * 成功メッセージが表示されるまで待つ
 * @param page - Playwright page object
 * @param message - 期待する成功メッセージ（部分一致）
 * @param timeout - タイムアウト時間（ミリ秒）
 */
export async function waitForSuccessMessage(
  page: Page, 
  message: string, 
  timeout = 5000
) {
  // Use locator with hasText filter to handle messages with quotes safely
  const successLocator = page.locator('[class*="success"]').filter({ hasText: message });
  await successLocator.waitFor({ state: 'visible', timeout });
}

/**
 * データ読み込み完了を待つ（エイリアス）
 * @deprecated Use waitForDataLoad instead
 */
export const _waitForDataLoad = waitForDataLoad;

/**
 * ページタイトルを検証（エイリアス）
 * @deprecated Use expectPageTitle instead
 */
export const _expectPageTitle = expectPageTitle;

/**
 * Test user login helper
 * @param page - Playwright page object
 * @param options - Login options
 * @returns true if login successful, false otherwise
 */
export async function loginTestUser(
  page: Page,
  options: { 
    debug?: boolean;
    email?: string;
    password?: string;
    timeout?: number;
  } = {}
): Promise<boolean> {
  const { 
    debug = false,
    email = TEST_USER.email,
    password = TEST_USER.password,
    timeout = 15000
  } = options;
  
  try {
    if (debug) console.log('Navigating to login page...');
    
    // Navigate to login page with retry
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout });
    await waitForPageLoad(page, { timeout });
    
    // Wait for form elements to be ready
    await page.waitForSelector('input[id="email"]', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('input[id="password"]', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('button[type="submit"]', { state: 'visible', timeout: 5000 });
    
    // Fill in credentials with explicit wait
    await page.fill('input[id="email"]', email);
    await page.fill('input[id="password"]', password);
    
    if (debug) console.log('Submitting login form...');
    
    // Submit login with explicit button wait
    const submitButton = page.locator('button[type="submit"]:has-text("ログイン")');
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });
    await submitButton.click();
    
    // Wait for navigation with flexible URL matching
    await Promise.race([
      page.waitForURL('/', { timeout }),
      page.waitForURL('/dashboard', { timeout }),
      page.waitForURL('/home', { timeout })
    ]).catch(() => {
      // Fallback: check if we're on any authenticated page
      const currentUrl = page.url();
      if (!currentUrl.includes('/auth/login') && !currentUrl.includes('/login')) {
        return; // Consider it successful if we navigated away from login
      }
      throw new Error('Login navigation failed');
    });
    
    if (debug) console.log('Login successful!');
    
    return true;
  } catch (error) {
    if (debug) {
      console.error('Login failed:', error);
      console.error('Current URL:', page.url());
    }
    return false;
  }
}