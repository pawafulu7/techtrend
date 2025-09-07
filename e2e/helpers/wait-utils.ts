import { Page, Locator } from '@playwright/test';

/**
 * 環境別タイムアウト値を取得
 * CI環境では長めのタイムアウトを設定
 */
export const getTimeout = (type: 'short' | 'medium' | 'long' = 'medium') => {
  const isCI = process.env.CI === 'true';
  
  const timeouts = {
    short: isCI ? 10000 : 5000,
    medium: isCI ? 30000 : 15000,
    long: isCI ? 60000 : 30000,
  };
  
  return timeouts[type];
};

/**
 * 記事リストの読み込みを待機
 */
export async function waitForArticles(page: Page) {
  await page.waitForSelector('[data-testid="article-card"], article', {
    state: 'visible',
    timeout: getTimeout('medium'),
  });
  await page.waitForLoadState('networkidle');
}

/**
 * タグフィルターボタンの表示を待機
 */
export async function waitForTagFilter(page: Page) {
  await page.waitForSelector('[data-testid="tag-filter-button"]', {
    state: 'visible',
    timeout: getTimeout('medium'),
  });
}

/**
 * タグドロップダウンの表示を待機
 */
export async function waitForTagDropdown(page: Page) {
  await page.waitForSelector('[data-testid="tag-dropdown"]', {
    state: 'visible',
    timeout: getTimeout('medium'),
  });
}

/**
 * ソースフィルターの表示を待機
 */
export async function waitForSourceFilter(page: Page) {
  await page.waitForSelector('[data-testid="source-filter"]', {
    state: 'visible',
    timeout: getTimeout('medium'),
  });
}

/**
 * フィルター適用後の待機
 * ネットワークアイドルと記事の再レンダリングを待つ
 */
export async function waitForFilterApplication(page: Page) {
  await page.waitForLoadState('networkidle');
  
  // 記事が存在することを確認（0件の場合もあるので存在チェックのみ）
  await page.waitForFunction(() => {
    const articleList = document.querySelector('[data-testid="article-list"]');
    return articleList !== null;
  }, { timeout: getTimeout('short') });
}

/**
 * ページ遷移の待機
 * URLの変更とネットワークアイドルを待つ
 */
export async function waitForNavigation(page: Page, urlPattern?: RegExp | string) {
  if (urlPattern) {
    await page.waitForURL(urlPattern, { timeout: getTimeout('medium') });
  }
  await page.waitForLoadState('networkidle');
}

/**
 * モバイルビューでのフィルターシート表示を待機
 */
export async function waitForMobileFilterSheet(page: Page) {
  await page.waitForSelector('[role="dialog"], .sheet-content, .modal', {
    state: 'visible',
    timeout: getTimeout('short'),
  });
}

/**
 * 要素のクリック可能状態を待機
 */
export async function waitForClickable(locator: Locator) {
  await locator.waitFor({
    state: 'visible',
    timeout: getTimeout('medium'),
  });
  
  // 要素が安定するまで少し待つ
  await locator.page().waitForTimeout(100);
}

/**
 * デバッグ用：現在のページ状態をログ出力
 */
export async function debugPageState(page: Page, label: string) {
  if (process.env.DEBUG) {
    const url = page.url();
    const title = await page.title();
    const articleCount = await page.locator('[data-testid="article-card"]').count();
    
    console.log(`[DEBUG] ${label}`);
    console.log(`  URL: ${url}`);
    console.log(`  Title: ${title}`);
    console.log(`  Articles: ${articleCount}`);
  }
}

/**
 * 安全なクリック処理
 * リトライとエラーハンドリングを含む
 */
export async function safeClick(locator: Locator, options?: { retries?: number }) {
  const maxRetries = options?.retries ?? 3;
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await locator.click({ timeout: getTimeout('short') });
      return; // 成功したら終了
    } catch (error) {
      lastError = error as Error;
      
      // リトライ前に少し待つ
      if (i < maxRetries - 1) {
        await locator.page().waitForTimeout(500 * (i + 1));
      }
    }
  }
  
  // すべてのリトライが失敗した場合
  if (lastError) {
    throw lastError;
  }
}