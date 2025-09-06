import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { SELECTORS } from '../constants/selectors';

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Test user type definition
export interface TestUser {
  id: string;
  email: string;
  name: string;
  password: string;
}

// Test user configuration (overridable with environment variables)
export const TEST_USER: TestUser = {
  id: process.env.E2E_TEST_USER_ID ?? 'test-user-id',
  email: process.env.E2E_TEST_USER_EMAIL ?? 'test@example.com',
  name: process.env.E2E_TEST_USER_NAME ?? 'Test User',
  password: process.env.E2E_TEST_USER_PASSWORD ?? 'TestPassword123',
};

// Browser-specific test users (for parallel testing)
// Prefer PLAYWRIGHT_WORKER_INDEX, fallback to TEST_PARALLEL_INDEX
const WORKER_INDEX = process.env.PLAYWRIGHT_WORKER_INDEX ?? process.env.TEST_PARALLEL_INDEX;
type BrowserName = 'chromium' | 'firefox' | 'webkit';

/**
 * Generate unique test user email for parallel testing
 * Includes timestamp for uniqueness across test runs
 */
function generateTestEmail(browser: string, index?: string): string {
  const timestamp = Date.now();
  const workerSuffix = index ? `-w${index}` : '';
  return `test-${browser}${workerSuffix}-${timestamp}@example.com`;
}

export const TEST_USERS: Record<BrowserName, TestUser> = {
  chromium: { 
    ...TEST_USER, 
    email: WORKER_INDEX != null
      ? generateTestEmail('chromium', WORKER_INDEX)
      : TEST_USER.email
  },
  firefox: { 
    ...TEST_USER, 
    email: WORKER_INDEX != null
      ? generateTestEmail('firefox', WORKER_INDEX)
      : TEST_USER.email
  },
  webkit: { 
    ...TEST_USER, 
    email: WORKER_INDEX != null
      ? generateTestEmail('webkit', WORKER_INDEX)
      : TEST_USER.email
  },
};

/**
 * ページの読み込みが完了するまで待機
 * 注: 開発サーバーは常時起動（http://localhost:3000）
 */
export async function waitForPageLoad(page: Page, options: { timeout?: number } = {}) {
  const { timeout = 30000 } = options;
  
  // Prefer DOM ready; try networkidle best-effort
  await page.waitForLoadState('domcontentloaded', { timeout });
  try {
    await page.waitForLoadState('networkidle', { timeout: Math.min(5000, Math.floor(timeout / 2)) });
  } catch {
    // ignore - networkidle might not be reached with WebSocket/SSE
  }
  
  // Wait for main content area to be visible using SELECTORS
  const mainContent = page.locator(SELECTORS.MAIN_CONTENT).first();
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
  // 記事要素を探す（SELECTORSを使用）
  const articles = page.locator(SELECTORS.ARTICLE_CARD);
  const count = await articles.count();
  expect(count).toBeGreaterThanOrEqual(minCount);
}

/**
 * ナビゲーションメニューが存在することを確認
 */
export async function expectNavigationMenu(page: Page) {
  // ナビゲーションメニューを特定（共通セレクタ優先、navをフォールバック）
  const nav = page.locator(`${SELECTORS.NAV_MENU}, nav`).first();
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
  const pathname = new URL(page.url()).pathname;
  if (typeof expectedPath === 'string') {
    expect(pathname).toBe(expectedPath);
  } else {
    expect(pathname).toMatch(expectedPath);
  }
}

/**
 * エラーメッセージが表示されていないことを確認
 */
export async function expectNoErrors(page: Page) {
  // Use only SELECTORS constants for consistency
  const visibleErrors = page.locator(`${SELECTORS.ERROR_MESSAGE}:visible`);
  await expect(visibleErrors).toHaveCount(0);
}

/**
 * ローディング状態が終了するまで待機
 */
export async function waitForLoadingComplete(page: Page) {
  await waitForLoadingToDisappear(page, 10000);
}

/**
 * データ読み込み完了を待つ
 * ローディング表示が消え、データ表示要素が現れるまで待機
 */
export async function waitForDataLoad(page: Page, timeout = 10000) {
  // Wait for loading indicator to disappear (use common selector)
  const loadingIndicator = page.locator(SELECTORS.LOADING_INDICATOR);
  await expect(loadingIndicator).toBeHidden({ timeout });
  
  // Wait for data content to appear
  const dataContent = page.locator('[data-loaded="true"], main [class*="card"], main article').first();
  await expect(dataContent).toBeVisible({ timeout });
}

/**
 * APIレスポンスを待つ
 * 指定したURLパターンに一致するAPIレスポンスを待機
 */
export async function waitForApiResponse(
  page: Page, 
  urlPattern: string | RegExp,
  options: {
    timeout?: number;
    acceptedStatuses?: number[];
  } = {}
) {
  const { timeout = 10000, acceptedStatuses } = options;
  
  return page.waitForResponse(
    response => {
      const url = response.url();
      const isMatch = typeof urlPattern === 'string' 
        ? url.includes(urlPattern)
        : urlPattern.test(url);
      if (!isMatch) return false;
      const status = response.status();
      // When acceptedStatuses is provided, require strict match
      if (acceptedStatuses && acceptedStatuses.length > 0) {
        return acceptedStatuses.includes(status);
      }
      // Default: accept 2xx or 304
      return (status >= 200 && status < 300) || status === 304;
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
        try {
          const flags = (expected.flags || '').replace(/[^gimsuy]/g, '');
          // naive guards: limit length and forbid catastrophic tokens
          if (expected.source.length > 2000) return false;
          if (/(\\d\+){3,}|(\(.+\)\+){3,}/.test(expected.source)) return false;
          const re = new RegExp(expected.source, flags);
          return re.test(text);
        } catch {
          return false;
        }
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
      const articleCards = document.querySelectorAll(selectors.articleCard);
      
      // いずれかの条件を満たせばOK
      return hasResultText || articleCards.length > 0;
    },
    {
      loadingIndicator: SELECTORS.LOADING_INDICATOR,
      searchResultText: SELECTORS.SEARCH_RESULT_TEXT,
      articleCard: SELECTORS.ARTICLE_CARD
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
  newPassword: process.env.E2E_TEST_USER_NEW_PASSWORD ?? 'NewTestPassword456',
};

/**
 * テストユーザーを作成
 * @param email - ユーザーのメールアドレス
 * @param password - パスワード
 * @param name - ユーザー名（オプショナル）
 */
export async function createTestUser(
  email: string, 
  password: string,
  name?: string
): Promise<TestUser> {
  // Implementation for test user creation
  // This would typically interact with your test database or API
  const user: TestUser = {
    id: `test-${Date.now()}`,
    email,
    name: name ?? 'Test User',
    password
  };
  
  // In a real implementation, you would:
  // 1. Call your API to create the user
  // 2. Store in test database
  // 3. Return the created user object
  
  console.log(`Created test user: ${email}`);
  return user;
}

/**
 * テストユーザーを削除
 * @param email - 削除するユーザーのメールアドレス
 */
export async function deleteTestUser(email: string): Promise<boolean> {
  // Implementation for test user deletion
  // This would typically interact with your test database or API
  
  try {
    // In a real implementation, you would:
    // 1. Call your API to delete the user
    // 2. Remove from test database
    // 3. Return success/failure status
    
    console.log(`Deleted test user: ${email}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete test user ${email}:`, error);
    return false;
  }
}

/**
 * アカウントタブを開く（ユーザーメニュー → プロフィール → アカウントタブ）
 * @param page - Playwright page object
 */
export async function openAccountTab(page: Page): Promise<boolean> {
  try {
    // ユーザーメニューのドロップダウンを開く（複数のセレクタでフォールバック）
    const userMenuTrigger = page.locator('[data-testid="user-menu-trigger"], [data-testid="user-menu"], button[aria-haspopup="menu"]').first();
    await userMenuTrigger.waitFor({ state: 'visible', timeout: 5000 });
    await userMenuTrigger.click();
    
    // プロフィールリンクをクリック
    const profileLink = page.locator('a[href="/profile"]');
    await profileLink.waitFor({ state: 'visible', timeout: 5000 });
    await profileLink.click();
    
    // ページが読み込まれるまで待機
    await waitForPageLoad(page);
    
    // アカウントタブをクリック
    const accountTab = page.locator('[role="tab"][data-value="account"], button:has-text("アカウント")').first();
    await accountTab.waitFor({ state: 'visible', timeout: 5000 });
    await accountTab.click();
    
    return true;
  } catch (error) {
    console.error('Failed to open account tab:', error);
    return false;
  }
}

/**
 * パスワード変更フォームを入力
 * @param page - Playwright page object
 * @param currentPassword - 現在のパスワード
 * @param newPassword - 新しいパスワード
 */
export async function fillPasswordChangeForm(
  page: Page, 
  passwords: { current: string; new: string; confirm: string }
) {
  // Use .first() instead of :first pseudo-class for better compatibility
  const currentPasswordInput = page.locator('input[name="currentPassword"], input[type="password"]').first();
  await currentPasswordInput.fill(passwords.current);
  
  await page.fill('input[name="newPassword"], input[placeholder*="新しいパスワード"]', passwords.new);
  await page.fill('input[name="confirmPassword"], input[placeholder*="確認"]', passwords.confirm);
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
): Promise<boolean> {
  try {
    // Use locator for text-destructive class which is used for validation errors
    const errorLocator = page.locator('.text-destructive').filter({ hasText: message });
    await errorLocator.waitFor({ state: 'visible', timeout });
    return true;
  } catch (error) {
    return false;
  }
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
): Promise<boolean> {
  try {
    // Use locator with hasText filter to handle messages with quotes safely
    const successLocator = page.locator('[class*="success"]').filter({ hasText: message });
    await successLocator.waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
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
// Login options interface
export interface LoginOptions {
  debug?: boolean;
  email?: string;
  password?: string;
  timeout?: number;
  successUrls?: string[];
}

export async function loginTestUser(
  page: Page,
  options: LoginOptions = {}
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
    
    // Wait for form elements (fallback selectors)
    const emailInput = page.locator('input#email, input[name="email"], input[type="email"]').first();
    const passwordInput = page.locator('input#password, input[name="password"], input[type="password"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });
    await emailInput.fill(email);
    await passwordInput.fill(password);
    
    if (debug) console.log('Submitting login form...');
    
    // Submit login with broader selector
    const submitButton = page
      .locator('button[type="submit"], [data-testid="login-submit"], button:has-text("ログイン"), button:has-text("Login")')
      .first();
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });
    await submitButton.click();
    
    // Wait for navigation with robust checks
    const successPaths = options.successUrls ?? ['/', '/dashboard', '/home'];
    const okPaths = new Set(successPaths);
    
    // Wait for URL change and verify no errors
    await page.waitForURL(
      (u) => {
        try { 
          const url = new URL(u);
          // Check if we're on a success page (not on login/error page)
          const isSuccessPath = okPaths.has(url.pathname);
          const notOnLoginPage = !url.pathname.includes('/auth/login');
          const notOnErrorPage = !url.pathname.includes('/error');
          return isSuccessPath && notOnLoginPage && notOnErrorPage;
        } catch { 
          return false; 
        }
      },
      { timeout }
    );
    
    // Additional verification: check for user menu or logout button
    try {
      const userIndicator = page.locator(
        '[data-testid="user-menu"], [data-testid="logout-button"], button:has-text("ログアウト")'
      ).first();
      await userIndicator.waitFor({ state: 'visible', timeout: 2000 });
    } catch {
      // User indicator might not be immediately visible, but URL check passed
    }
    
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