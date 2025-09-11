import { Page, Locator } from '@playwright/test';

/**
 * E2E テストヘルパーユーティリティ
 * 
 * このファイルは、CI環境（GitHub Actions）での安定性を最優先に設計されています。
 * 
 * 重要な設計方針：
 * 1. CI環境では長めのタイムアウトを設定
 * 2. シンプルな待機条件を優先（複雑な条件はタイムアウトしやすい）
 * 3. 段階的な改善を前提とした実装
 * 
 * 注意事項：
 * - waitForTimeout() の使用は意図的です（CI環境での安定性のため）
 * - 複雑な waitForFunction は CI環境で不安定になる傾向があります
 * - 理想的な実装より、安定して動作することを優先しています
 * 
 * 参考：__tests__/e2e/IMPROVEMENT-STRATEGY.md
 */

/**
 * CI環境を判定（より柔軟な判定）
 */
const isCI = ['1', 'true', 'yes'].includes(String(process.env.CI).toLowerCase());

/**
 * 環境に応じたタイムアウト値
 */
export const TIMEOUTS = {
  short: isCI ? 10000 : 5000,
  medium: isCI ? 30000 : 15000,
  long: isCI ? 60000 : 30000,
  extraLong: isCI ? 90000 : 45000,
};

/**
 * ポーリング間隔
 */
export const POLLING_INTERVALS = {
  fast: 100,
  normal: 500,
  slow: 1000,
};

/**
 * 環境別タイムアウト値を取得
 * CI環境では長めのタイムアウトを設定
 */
export const getTimeout = (type: 'short' | 'medium' | 'long' | 'extraLong' = 'medium') => {
  return TIMEOUTS[type];
};

/**
 * ポーリング間隔を取得
 */
export function getPollingInterval(speed: 'fast' | 'normal' | 'slow' = 'normal'): number {
  return POLLING_INTERVALS[speed];
}

/**
 * CI環境かどうかを判定
 */
export function isRunningInCI(): boolean {
  return isCI;
}

/**
 * 記事リストの読み込みを待機（条件ベース）
 */
export async function waitForArticles(page: Page, options?: {
  timeout?: number;
  minCount?: number;
  waitForNetworkIdle?: boolean;
  allowEmpty?: boolean;
}) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const minCount = options?.minCount ?? 1;
  const waitForNetworkIdle = options?.waitForNetworkIdle ?? true;
  const allowEmpty = options?.allowEmpty ?? false;
  
  // ネットワークアイドルを先に待つオプション
  if (waitForNetworkIdle) {
    try {
      await page.waitForLoadState('networkidle', { timeout: getTimeout('short') });
    } catch {
      // ネットワークアイドルがタイムアウトしても続行
    }
  }
  
  // 複数のセレクターを順番に試す
  const selectors = [
    '[data-testid="article-card"]',
    '[data-testid="article-list-item"]',
    '[data-testid="article-list"]',
    'article',
    '.article-card',
    '.article-item',
    '.article-list'
  ];
  
  let found = false;
  
  // 各セレクターを順番に試す
  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector, {
        state: 'visible',
        timeout: Math.floor(timeout / selectors.length)
      });
      if (element) {
        found = true;
        break;
      }
    } catch {
      continue; // 次のセレクターを試す
    }
  }
  
  // 記事が見つからない場合
  if (!found && !allowEmpty) {
    // もう一度総合的なセレクターで試す
    try {
      await page.waitForSelector(
        '[data-testid="article-card"], [data-testid="article-list-item"], article, .article-card, .article-item',
        { state: 'visible', timeout: getTimeout('short') }
      );
    } catch (error) {
      // 記事がなくても続行するオプション
      if (allowEmpty) {
        console.log('No articles found, but continuing as allowEmpty is true');
        return;
      }
      throw new Error(`No articles found with any selector after ${timeout}ms`);
    }
  }
  
  // 最小数の記事が表示されるまで待機
  if (minCount > 1 && found) {
    try {
      await page.waitForFunction(
        (min) => {
          const articles = document.querySelectorAll(
            '[data-testid="article-card"], [data-testid="article-list-item"], article, .article-card, .article-item'
          );
          return articles.length >= min;
        },
        minCount,
        { timeout: getTimeout('short'), polling: getPollingInterval('normal') }
      );
    } catch {
      // 最小数に達しなくても続行
      console.log(`Only found less than ${minCount} articles, but continuing`);
    }
  }
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
export async function waitForFilterApplication(page: Page, options?: {
  timeout?: number;
  waitForNetworkIdle?: boolean;
}) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const waitForNetworkIdle = options?.waitForNetworkIdle ?? true;
  
  if (waitForNetworkIdle) {
    await page.waitForLoadState('networkidle', { timeout });
  }
  
  // 記事が存在することを確認（0件の場合もあるので存在チェックのみ）
  await page.waitForFunction(() => {
    const articleList = document.querySelector('[data-testid="article-list"]');
    return articleList !== null;
  }, { timeout, polling: getPollingInterval('fast') });
}

/**
 * ページ遷移の待機
 * URLの変更とネットワークアイドルを待つ
 */
export async function waitForNavigation(page: Page, urlPattern?: RegExp | string, options?: {
  timeout?: number;
  waitForNetworkIdle?: boolean;
}) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const waitForNetworkIdle = options?.waitForNetworkIdle ?? true;
  
  if (urlPattern) {
    await page.waitForURL(urlPattern, { timeout });
  }
  
  if (waitForNetworkIdle) {
    await page.waitForLoadState('networkidle', { timeout: getTimeout('short') });
  }
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
export async function waitForClickable(locator: Locator, options?: {
  timeout?: number;
  stabilityDelay?: number;
}) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const stabilityDelay = options?.stabilityDelay ?? 100;
  
  await locator.waitFor({
    state: 'visible',
    timeout,
  });
  
  // 要素が安定するまで少し待つ
  if (stabilityDelay > 0) {
    await locator.page().waitForTimeout(stabilityDelay);
  }
}

/**
 * デバッグ用：現在のページ状態をログ出力
 */
export async function debugPageState(page: Page, label: string) {
  if (process.env.DEBUG || process.env.E2E_DEBUG) {
    const url = page.url();
    const title = await page.title();
    const articleCount = await page.locator('[data-testid="article-card"]').count();
    
    // デバッグ環境でのみ出力（通常はコメントアウト）
    // console.log(`[DEBUG] ${label}`);
    // console.log(`  URL: ${url}`);
    // console.log(`  Title: ${title}`);
    // console.log(`  Articles: ${articleCount}`);
  }
}

/**
 * 安全なクリック処理
 * リトライとエラーハンドリングを含む
 */
export async function safeClick(locator: Locator, options?: {
  retries?: number;
  force?: boolean;
  delay?: number;
}) {
  const maxRetries = options?.retries ?? 3;
  const force = options?.force ?? false;
  const delay = options?.delay ?? 500;
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await locator.click({ timeout: getTimeout('short'), force });
      return; // 成功したら終了
    } catch (error) {
      lastError = error as Error;
      
      // リトライ前に待つ（指数バックオフ）
      if (i < maxRetries - 1) {
        await locator.page().waitForTimeout(delay * Math.pow(2, i));
      }
    }
  }
  
  // すべてのリトライが失敗した場合
  if (lastError) {
    throw lastError;
  }
}

/**
 * タブパネルの切り替えを待つ
 */
export async function waitForTabSwitch(
  page: Page,
  tabSelector: string,
  options?: {
    timeout?: number;
  }
) {
  const timeout = options?.timeout ?? getTimeout('short');
  
  try {
    // タブのアニメーションが完了するのを待つ
    await page.waitForFunction(
      (selector) => {
        const tab = document.querySelector(selector);
        if (!tab) return false;
        
        // aria-selected属性をチェック
        const isSelected = tab.getAttribute('aria-selected') === 'true';
        // data-state属性をチェック（Radix UIの場合）
        const isActive = tab.getAttribute('data-state') === 'active';
        
        return isSelected || isActive;
      },
      tabSelector,
      { timeout, polling: 100 }
    );
    
    // タブコンテンツが表示されるまで待つ
    await page.waitForTimeout(300); // アニメーション用の短い待機
  } catch (error) {
    // エラーログは開発時のみ（本番ではコメントアウト）
    // console.error(`Failed to wait for tab switch: ${error}`);
    throw error;
  }
}

/**
 * 入力フィールドの値が変更されるまで待つ
 */
export async function waitForInputValue(
  page: Page,
  selector: string,
  expectedValue: string,
  options?: {
    timeout?: number;
    partial?: boolean;
  }
) {
  const timeout = options?.timeout ?? getTimeout('short');
  const partial = options?.partial ?? false;
  
  await page.waitForFunction(
    ({ selector, expectedValue, partial }) => {
      const input = document.querySelector(selector) as HTMLInputElement;
      if (!input) return false;
      
      const actualValue = input.value;
      if (partial) {
        return actualValue.includes(expectedValue);
      }
      return actualValue === expectedValue;
    },
    { selector, expectedValue, partial },
    { timeout, polling: 100 }
  );
}

/**
 * URLパラメータが特定の値になるまで待機（ポーリング改善）
 */
export async function waitForUrlParam(
  page: Page,
  paramName: string,
  paramValue?: string,
  options?: {
    timeout?: number;
    polling?: 'fast' | 'normal' | 'slow';
    retries?: number;
  }
) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const polling = getPollingInterval(options?.polling ?? 'normal');
  const maxRetries = options?.retries ?? (process.env.CI ? 3 : 1);
  
  // Next.jsのrouter.pushは非同期なので、最初に少し待機
  // CI環境では更に長く待機
  // 初期待機時間を短縮（CI環境でも500ms）
  const initialWait = 500;
  await page.waitForTimeout(initialWait);
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // CI環境でもリトライ前の待機を短縮
      if (attempt > 0) {
        // 線形バックオフ（500ms, 1000ms, 1500ms...）に変更
        await page.waitForTimeout(500 + (500 * attempt));
      }
      
      await page.waitForFunction(
        ({ name, value }) => {
          const url = new URL(window.location.href);
          const param = url.searchParams.get(name);
          if (value === undefined) {
            return param !== null;
          }
          return param === value;
        },
        { name: paramName, value: paramValue },
        { timeout: Math.max(5000, timeout / maxRetries), polling }
      );
      
      // 成功したら終了
      return;
    } catch (error) {
      lastError = error as Error;
      
      // 最後のリトライでなければ続行
      if (attempt < maxRetries - 1) {
        // 追加の待機時間も短縮（最大2秒）
        const backoffTime = Math.min(500 * (attempt + 1), 2000);
        await page.waitForTimeout(backoffTime);
        continue;
      }
    }
  }
  
  // すべてのリトライが失敗した場合
  if (lastError) {
    throw lastError;
  }
}

/**
 * セレクターが非表示になるまで待機（detached オプション付き）
 */
export async function waitForSelectorToDisappear(
  page: Page,
  selector: string,
  options?: {
    timeout?: number;
    waitForDetached?: boolean;
  }
) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const state = options?.waitForDetached ? 'detached' : 'hidden';
  
  await page.waitForSelector(selector, { state, timeout });
}

/**
 * 要素のテキストが特定の値になるまで待機
 */
export async function waitForElementText(
  page: Page,
  selector: string,
  expectedText: string,
  options?: {
    timeout?: number;
    exact?: boolean;
    polling?: 'fast' | 'normal' | 'slow';
  }
) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const exact = options?.exact ?? true;
  const polling = getPollingInterval(options?.polling ?? 'fast');
  
  await page.waitForFunction(
    ({ sel, text, exactMatch }) => {
      const element = document.querySelector(sel);
      if (!element) return false;
      const elementText = element.textContent?.trim() ?? '';
      return exactMatch ? elementText === text : elementText.includes(text);
    },
    { sel: selector, text: expectedText, exactMatch: exact },
    { timeout, polling }
  );
}

/**
 * 複数の要素が表示されるまで待機
 */
export async function waitForElements(
  page: Page,
  selectors: string[],
  options?: {
    timeout?: number;
    waitForAll?: boolean;
  }
) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const waitForAll = options?.waitForAll ?? true;
  
  if (waitForAll) {
    // 全ての要素を待機
    await Promise.all(
      selectors.map(selector =>
        page.waitForSelector(selector, { state: 'visible', timeout })
      )
    );
  } else {
    // いずれかの要素を待機
    await page.waitForSelector(selectors.join(', '), { state: 'visible', timeout });
  }
}

/**
 * エクスポネンシャルバックオフでリトライ
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelay = options?.initialDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 10000;
  const factor = options?.factor ?? 2;
  
  let delay = initialDelay;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * factor, maxDelay);
    }
  }
  
  throw new Error('Max retries exceeded');
}

/**
 * ページロードの完了を待機（networkidle オプション付き）
 */
export async function waitForPageLoad(page: Page, options?: {
  timeout?: number;
  waitForNetworkIdle?: boolean;
}) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const waitForNetworkIdle = options?.waitForNetworkIdle ?? false;
  
  const promises = [
    page.waitForLoadState('load', { timeout }),
    page.waitForLoadState('domcontentloaded', { timeout }),
  ];
  
  if (waitForNetworkIdle) {
    promises.push(page.waitForLoadState('networkidle', { timeout }));
  }
  
  await Promise.all(promises);
}

/**
 * 要素が表示されてクリック可能になるまで待機（リトライ付き）
 */
export async function waitForElementAndClick(
  page: Page,
  selector: string,
  options?: {
    timeout?: number;
    retries?: number;
    force?: boolean;
  }
) {
  const timeout = options?.timeout ?? getTimeout('medium');
  const retries = options?.retries ?? 3;
  const force = options?.force ?? false;
  
  const element = page.locator(selector).first();
  
  for (let i = 0; i < retries; i++) {
    try {
      await element.waitFor({ state: 'visible', timeout });
      await element.click({ force, timeout });
      return; // 成功したら終了
    } catch (error) {
      if (i === retries - 1) throw error; // 最後の試行で失敗したらエラーを投げる
      await page.waitForTimeout(getPollingInterval('normal')); // リトライ前に少し待機
    }
  }
}