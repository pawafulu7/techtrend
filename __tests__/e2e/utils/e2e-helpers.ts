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

// Admin test user configuration (overridable with environment variables)
export const ADMIN_TEST_USER: TestUser = {
  id: process.env.E2E_ADMIN_USER_ID ?? 'admin-user-id',
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@example.com',
  name: process.env.E2E_ADMIN_NAME ?? 'Admin User',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'AdminPassword123',
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
export async function waitForPageLoad(page: Page, options: { timeout?: number, waitForNetworkIdle?: boolean } = {}) {
  const { timeout = 30000, waitForNetworkIdle = true } = options;
  
  // Wait for DOM content loaded first
  await page.waitForLoadState('domcontentloaded', { timeout });
  
  // Try to wait for network idle if requested
  if (waitForNetworkIdle) {
    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(3000, Math.floor(timeout / 3)) });
    } catch {
      // ignore - networkidle might not be reached with WebSocket/SSE
    }
  }
  
  // Wait for the page to have a title (ensures React app is mounted)
  await page.waitForFunction(
    () => document.title && document.title.length > 0,
    undefined,
    { timeout: 10000, polling: 100 }
  ).catch(() => {
    // If title doesn't appear, continue anyway
  });
  
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
  
  // すべてのローディングインジケーターがDOM上から消えるまで待つ
  // Playwrightのstrict modeでは単一要素でないとtoBeHiddenが失敗するため、件数で判定する
  await expect(loadingIndicator).toHaveCount(0, { timeout });
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
export async function openAccountTab(
  page: Page,
  options: { debug?: boolean } = {}
): Promise<boolean> {
  const { debug = false } = options;
  
  try {
    // Early return if already on profile page
    if (page.url().includes('/profile')) {
      if (debug) console.log('[openAccountTab] Already on profile page, looking for account tab...');
      
      // Radix UI TabsTrigger specific selectors
      const accountTabSelectors = [
        'button[value="account"]',  // Radix UI TabsTrigger with value
        '[role="tab"][value="account"]',  // TabsTrigger with role
        'button[role="tab"][value="account"]',  // Full TabsTrigger selector
        'button:has-text("アカウント")',  // Text-based fallback
        '[role="tab"]:has-text("アカウント")',  // Role with text
        '[data-testid="account-tab"]'  // data-testid if added
      ];
      
      // Debug: Check what tabs are available
      if (debug) {
        const allTabs = await page.locator('[role="tab"], button[value]').count();
        console.log(`[openAccountTab] Total tabs found: ${allTabs}`);
        
        if (allTabs > 0) {
          const tabTexts = await page.locator('[role="tab"], button[value]').allTextContents();
          console.log('[openAccountTab] Tab texts:', tabTexts);
        }
      }
      
      for (const selector of accountTabSelectors) {
        try {
          const tab = page.locator(selector).first();
          const count = await tab.count();
          
          if (debug && count > 0) {
            console.log(`[openAccountTab] Found tab with selector: ${selector}`);
          }
          
          if (count > 0) {
            await tab.scrollIntoViewIfNeeded();
            await tab.waitFor({ state: 'visible', timeout: 2000 });
            await tab.click();
            
            if (debug) console.log(`[openAccountTab] Clicked tab with selector: ${selector}`);
            
            // Wait for tab content to be active
            try {
              await page.waitForSelector('[role="tabpanel"][data-state="active"], :has-text("パスワード変更")', { timeout: 3000 });
              if (debug) console.log('[openAccountTab] Tab content activated successfully');
              return true;
            } catch {
              if (debug) console.log('[openAccountTab] Tab content did not activate, trying next selector');
            }
          }
        } catch (err) {
          if (debug) console.log(`[openAccountTab] Error with selector ${selector}:`, err);
          continue;
        }
      }
      
      // If no selector worked, log error
      if (debug) console.error('[openAccountTab] Could not find account tab with any selector');
      return false;
    }

    // ユーザーメニューのドロップダウンを開く（複数のセレクタでフォールバック）
    const userMenuTrigger = page.locator('[data-testid="user-menu-trigger"], [data-testid="user-menu"], button[aria-haspopup="menu"]').first();
    await userMenuTrigger.waitFor({ state: 'visible', timeout: 5000 });
    await userMenuTrigger.click();
    
    // プロフィールリンクをクリック（共通セレクタ追加）
    const profileLink = page.locator('a[href="/profile"], [data-testid="profile-link"], a:has-text("プロフィール")').first();
    await profileLink.waitFor({ state: 'visible', timeout: 5000 });
    
    // Combine click and URL wait for efficiency
    await Promise.all([
      profileLink.click(),
      page.waitForURL('**/profile', { timeout: 5000 })
    ]);
    
    await waitForPageLoad(page);
    
    // アカウントタブをクリック（Radix UI TabsTrigger specific）
    const accountTabSelectors = [
      'button[value="account"]',
      '[role="tab"][value="account"]',
      'button[role="tab"][value="account"]',
      'button:has-text("アカウント")',
      '[role="tab"]:has-text("アカウント")',
      '[data-testid="account-tab"]'
    ];
    
    for (const selector of accountTabSelectors) {
      try {
        const tab = page.locator(selector).first();
        const count = await tab.count();
        if (count > 0) {
          await tab.scrollIntoViewIfNeeded();
          await tab.waitFor({ state: 'visible', timeout: 2000 });
          await tab.click();
          await page.waitForSelector('[role="tabpanel"][data-state="active"]', { timeout: 3000 });
          return true;
        }
      } catch {
        continue;
      }
    }
    
    return false;
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
  // パスワード変更セクションが表示されるまで待機（より広範なセレクタを使用）
  const passwordSectionSelectors = [
    'form:has-text("パスワード変更")',
    'section:has-text("パスワード変更")',
    'div:has-text("パスワード変更"):has(input[type="password"])',
    '[data-testid="password-change-form"]',
    'form[id*="password"]',
    'form[name*="password"]'
  ];
  
  let passwordSection = null;
  for (const selector of passwordSectionSelectors) {
    try {
      const element = page.locator(selector).first();
      const count = await element.count();
      if (count > 0) {
        passwordSection = element;
        break;
      }
    } catch {
      // セレクタが無効な場合は次を試す
      continue;
    }
  }
  
  if (!passwordSection) {
    // フォームが見つからない場合は、パスワード入力欄を含む最も近い親要素を探す
    const passwordInput = page.locator('input[type="password"]').first();
    const inputCount = await passwordInput.count();
    if (inputCount > 0) {
      // パスワード入力欄を含む親フォームまたはセクションを取得
      passwordSection = page.locator('form:has(input[type="password"]), section:has(input[type="password"])').first();
    }
  }
  
  if (!passwordSection) {
    throw new Error('Password change section not found');
  }
  
  await passwordSection.waitFor({ state: 'visible', timeout: 10000 });
  
  // Enhanced priority chain for password inputs with precise targeting
  const currentPasswordInput = passwordSection.locator([
    '[data-testid="current-password-input"]',
    'input[name="currentPassword"][type="password"]',
    'input[autocomplete="current-password"][type="password"]',
    'form:has-text("パスワード変更") input[type="password"]:first-of-type',
    'label:has-text("現在のパスワード") + input[type="password"]',
    'input[placeholder*="現在"][type="password"]'
  ].join(', ')).first();
  
  // 要素が見つかるまで待機
  await currentPasswordInput.waitFor({ state: 'visible', timeout: 5000 });
  await currentPasswordInput.fill(passwords.current);
  
  const newPasswordInput = passwordSection.locator([
    '[data-testid="new-password-input"]',
    'input[name="newPassword"][type="password"]',
    'input[autocomplete="new-password"][type="password"]:first-of-type',
    'form:has-text("パスワード変更") input[type="password"]:nth-of-type(2)',
    'label:has-text("新しいパスワード") + input[type="password"]',
    'input[placeholder*="新しいパスワード"][type="password"]'
  ].join(', ')).first();
  await newPasswordInput.waitFor({ state: 'visible', timeout: 5000 });
  await newPasswordInput.fill(passwords.new);
  
  const confirmPasswordInput = passwordSection.locator([
    '[data-testid="confirm-password-input"]',
    'input[name="confirmPassword"][type="password"]',
    'input[autocomplete="new-password"][type="password"]:nth-of-type(2)',
    'form:has-text("パスワード変更") input[type="password"]:nth-of-type(3)',
    'label:has-text("確認") + input[type="password"]',
    'input[placeholder*="確認"][type="password"]'
  ].join(', ')).first();
  await confirmPasswordInput.waitFor({ state: 'visible', timeout: 5000 });
  await confirmPasswordInput.fill(passwords.confirm);
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
    // Use common error message selectors with prioritized fallback
    const escapedMessage = escapeRegex(message);
    const errorLocator = page.locator('[role="alert"], [data-testid="error-message"], .text-destructive, .error').filter({ 
      hasText: new RegExp(escapedMessage, 'i') // Case-insensitive regex for text variations
    });
    await errorLocator.waitFor({ state: 'visible', timeout });
    return true;
  } catch (error) {
    // Minimal debug logging
    console.debug(`Error message not found: "${message}"`);
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
    // Prioritize common success message selectors over class-name dependency
    const successLocator = page.locator('[role="status"], [data-testid="success-message"], [aria-live="polite"], [class*="success"]').filter({ hasText: message });
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

const E2E_BASE_URL =
  process.env.BASE_URL ??
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  'http://localhost:3000';

function getAuthOrigin(): string {
  return new URL(E2E_BASE_URL).origin;
}

function parseSetCookieForBrowserContext(header: string): {
  name: string;
  value: string;
  url: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'None' | 'Strict';
  expires?: number;
} | null {
  const parts = header.split(';').map((part) => part.trim()).filter(Boolean);
  const [nameValue, ...attributes] = parts;

  if (!nameValue) return null;

  const separatorIndex = nameValue.indexOf('=');
  if (separatorIndex <= 0) return null;

  const name = nameValue.slice(0, separatorIndex).trim();
  const value = nameValue.slice(separatorIndex + 1).trim();
  if (!name) return null;

  const cookie: {
    name: string;
    value: string;
    url: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Lax' | 'None' | 'Strict';
    expires?: number;
  } = {
    name,
    value,
    url: getAuthOrigin(),
  };

  for (const attribute of attributes) {
    const [rawKey, ...rawValueParts] = attribute.split('=');
    const key = rawKey?.trim().toLowerCase();
    const rawValue = rawValueParts.join('=').trim();

    if (key === 'httponly') {
      cookie.httpOnly = true;
      continue;
    }

    if (key === 'secure') {
      cookie.secure = true;
      continue;
    }

    if (key === 'samesite') {
      const sameSite = rawValue.toLowerCase();
      if (sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none') {
        cookie.sameSite =
          sameSite === 'lax'
            ? 'Lax'
            : sameSite === 'strict'
              ? 'Strict'
              : 'None';
      }
      continue;
    }

    if (key === 'max-age') {
      const maxAge = Number.parseInt(rawValue, 10);
      if (Number.isFinite(maxAge)) {
        cookie.expires = Math.floor(Date.now() / 1000) + maxAge;
      }
      continue;
    }

    if (key === 'expires') {
      const expiresAt = Date.parse(rawValue);
      if (!Number.isNaN(expiresAt)) {
        cookie.expires = Math.floor(expiresAt / 1000);
      }
    }
  }

  return cookie;
}

async function syncAuthCookiesToBrowserContext(
  page: Page,
  setCookieHeaders: string[],
  debug: boolean
): Promise<void> {
  const cookies = setCookieHeaders
    .map((header) => parseSetCookieForBrowserContext(header))
    .filter((cookie): cookie is NonNullable<typeof cookie> => cookie !== null);

  if (cookies.length === 0) {
    if (debug) console.log('[loginTestUser] No Set-Cookie headers to sync');
    return;
  }

  await page.context().addCookies(cookies);

  if (debug) {
    const cookieNames = cookies.map((cookie) => cookie.name).join(', ');
    console.log(`[loginTestUser] Synced cookies to browser context: ${cookieNames}`);
  }
}

async function hasAuthenticatedSession(
  page: Page,
  email: string,
  debug: boolean
): Promise<boolean> {
  const response = await page.request.get('/api/auth/get-session', {
    failOnStatusCode: false,
  });

  if (!response.ok()) {
    if (debug) {
      console.log(
        `[loginTestUser] get-session returned ${response.status()}`
      );
    }
    return false;
  }

  const body = await response.json().catch(() => null);
  const sessionEmail =
    typeof body === 'object' && body !== null
      ? (body as { user?: { email?: string | null } | null }).user?.email
      : undefined;

  if (debug) {
    console.log(
      `[loginTestUser] get-session user: ${sessionEmail ?? 'anonymous'}`
    );
  }

  return sessionEmail === email;
}

async function waitForAuthenticatedSession(
  page: Page,
  email: string,
  timeout: number,
  debug: boolean
): Promise<boolean> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await hasAuthenticatedSession(page, email, debug)) {
      return true;
    }
    await page.waitForTimeout(250);
  }

  return false;
}

export async function loginTestUser(
  page: Page,
  options: LoginOptions = {}
): Promise<boolean> {
  const {
    debug = false,
    email = TEST_USER.email,
    password = TEST_USER.password,
    timeout = 30000
  } = options;

  // Strategy 1: Direct API login (bypasses UI timing issues)
  try {
    if (debug) console.log(`[loginTestUser] Attempting API login for: ${email}`);

    const response = await page.request.post('/api/auth/sign-in/email', {
      data: { email, password },
      failOnStatusCode: false,
      headers: {
        origin: getAuthOrigin(),
        referer: `${getAuthOrigin()}/auth/login`,
      },
    });

    if (response.ok()) {
      if (debug) console.log('[loginTestUser] API login successful');
      const setCookieHeaders = response
        .headersArray()
        .filter((header) => header.name.toLowerCase() === 'set-cookie')
        .map((header) => header.value);

      await syncAuthCookiesToBrowserContext(page, setCookieHeaders, debug);

      if (await waitForAuthenticatedSession(page, email, 5000, debug)) {
        await page.goto('/', { waitUntil: 'domcontentloaded', timeout });
        if (debug) console.log(`[loginTestUser] Session verified after API login`);
        return true;
      }

      if (debug) {
        console.log(
          '[loginTestUser] API login did not establish a browser session, falling back to UI'
        );
      }
    } else if (debug) {
      console.log(
        `[loginTestUser] API login returned ${response.status()}: ${await response.text()}`
      );
    }
  } catch (error) {
    if (debug) console.error('[loginTestUser] API login error:', error);
  }

  // Strategy 2: UI-based login (fallback)
  try {
    if (debug) console.log(`[loginTestUser] Falling back to UI login for: ${email}`);

    await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout });
    await waitForPageLoad(page, { timeout });

    const emailInput = page.locator('input#email, input[name="email"], input[type="email"]').first();
    const passwordInput = page.locator('input#password, input[name="password"], input[type="password"]').first();

    await emailInput.waitFor({ state: 'visible', timeout: 5000 });
    await passwordInput.waitFor({ state: 'visible', timeout: 5000 });

    await emailInput.fill(email);
    await passwordInput.fill(password);

    const submitButton = page
      .locator('button[type="submit"], [data-testid="login-submit"], button:has-text("ログイン"), button:has-text("Login")')
      .first();
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });

    await submitButton.click();

    const sessionReady = await waitForAuthenticatedSession(
      page,
      email,
      Math.min(timeout, 10000),
      debug
    );

    if (!sessionReady) {
      if (debug) {
        const finalUrl = page.url();
        console.log(
          `[loginTestUser] UI login did not establish a session, final URL: ${finalUrl}`
        );
      }
      return false;
    }

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout });

    if (debug) console.log('[loginTestUser] UI login succeeded');
    return true;
  } catch (error) {
    if (debug) console.error('[loginTestUser] UI login failed:', (error as Error).message);
    return false;
  }
}

/**
 * 管理者ユーザーでログインする
 * @param page - Playwright page object
 * @param options - Login options (email/password は ADMIN_TEST_USER から取得)
 * @returns true if login successful, false otherwise
 */
export async function loginAsAdmin(
  page: Page,
  options: Omit<LoginOptions, 'email' | 'password'> = {}
): Promise<boolean> {
  return loginTestUser(page, {
    ...options,
    email: ADMIN_TEST_USER.email,
    password: ADMIN_TEST_USER.password,
  });
}
