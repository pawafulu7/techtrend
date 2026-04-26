import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { SELECTORS } from '../constants/selectors';

/**
 * ページの読み込みが完了するまで待機
 * 注: 開発サーバーは常時起動（http://localhost:3000）
 */
export async function waitForPageLoad(page: Page) {
  // DOMコンテンツの読み込み完了を待つ
  await page.waitForLoadState('domcontentloaded');
  
  // 主要な要素が表示されるまで待機（動的待機）
  try {
    // ヘッダーまたはメインコンテンツエリアの存在を確認
    await page.waitForSelector('[data-testid="header"], header, nav, main', {
      timeout: 5000,
      state: 'visible'
    });
  } catch {
    // フォールバック: セレクタが見つからない場合は基本的な要素を待つ
    await page.waitForSelector('body', { state: 'visible' });
  }
  
  // JavaScriptの初期化完了を待つ
  await page.waitForFunction(() => {
    // React/Next.jsアプリケーションの準備完了を確認
    return document.readyState === 'complete' && 
           (document.querySelector('[data-reactroot]') !== null || 
            document.querySelector('#__next') !== null ||
            document.querySelector('main') !== null);
  }, { timeout: 5000 });
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
  // Issue #611: data-testid プライマリ化により class 依存セレクタを撤去
  const articles = page.locator(SELECTORS.ARTICLE_CARD);
  const count = await articles.count();
  expect(count).toBeGreaterThanOrEqual(minCount);
}

/**
 * Locator がヒットしていることをアサート
 * Issue #611: count() === 0 でテストがサイレントに通過する no-op を防ぐ
 *
 * @param locator - 確認対象の Locator
 * @param name - 失敗時のメッセージに含める識別名
 * @param min - 期待する最小ヒット数（既定: 1）
 */
export async function assertLocatorFound(
  locator: Locator,
  name: string,
  min = 1
): Promise<void> {
  const count = await locator.count();
  expect(count, `${name} should match at least ${min} element(s) but matched ${count}`).toBeGreaterThanOrEqual(min);
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
export async function expectPageTitle(page: Page, expectedTitle: string) {
  await expect(page).toHaveTitle(new RegExp(expectedTitle, 'i'));
}

/**
 * URLパスを検証
 */
export async function expectUrlPath(page: Page, expectedPath: string) {
  await expect(page).toHaveURL(new RegExp(expectedPath));
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
 * Issue #611: 旧 [data-testid="loading"] から SELECTORS.LOADING_SPINNER (loading-spinner) に統一
 */
export async function waitForLoadingComplete(page: Page) {
  const loading = page.locator(SELECTORS.LOADING_SPINNER);
  await expect(loading).toBeHidden({ timeout: 10000 });
}

/**
 * データ読み込み完了を待つ
 * PR #618 review: aria-hidden / opacity:0 で残置する spinner も非表示として扱う
 * 完全実装は e2e-helpers.ts 版に集約し、ここでは re-export して二重実装を解消
 */
export { waitForDataLoad } from './e2e-helpers';

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
    ({ selector, expectedText }) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const text = element.textContent || '';
      
      if (typeof expectedText === 'string') {
        return text.includes(expectedText);
      } else if (expectedText && typeof expectedText === 'object' && expectedText.type === 'regexp') {
        // RegExpをsourceとflagsから再構築
        const pattern = new RegExp(expectedText.source, expectedText.flags);
        return pattern.test(text);
      }
      return false;
    },
    { 
      selector, 
      expectedText: expectedText instanceof RegExp 
        ? { type: 'regexp', source: expectedText.source, flags: expectedText.flags }
        : expectedText 
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
 * Issue #611: LOADING_INDICATOR を LOADING_SPINNER 1 エントリに統合
 */
export async function waitForLoadingToDisappear(page: Page, timeout = 10000) {
  const loadingIndicator = page.locator(SELECTORS.LOADING_SPINNER);

  // ローディングインジケーターが存在する場合、消えるまで待つ
  const count = await loadingIndicator.count();
  if (count > 0) {
    await loadingIndicator.first().waitFor({ state: 'hidden', timeout });
  }
}

/**
 * 検索結果の表示を待つ
 * 検索実行後、結果が表示されるまで待機
 */
export async function waitForSearchResults(page: Page, timeout = 30000) {
  // まずローディングインジケーターが消えるのを待つ
  await waitForLoadingToDisappear(page, timeout / 2);
  
  // 検索結果のテキストまたは記事カードが表示されるのを待つ
  // Issue #611: class 依存セレクタを data-testid プライマリ化、querySelector('p') を SELECTORS 化
  await page.waitForFunction(
    (selectors) => {
      // ローディング状態でないことを確認
      const loader = document.querySelector(selectors.loadingSpinner);
      if (loader) return false;

      // 検索結果のテキストまたは記事カードを確認（SEARCH_RESULT_TEXT を優先）
      const resultText = document.querySelector(selectors.searchResultText);
      const hasResultText = resultText && (
        resultText.textContent?.includes('件') ||
        resultText.textContent?.includes('結果') ||
        resultText.textContent?.includes('No results') ||
        resultText.textContent?.includes('記事が見つかりませんでした')
      );

      // 記事カードの存在も確認
      const articleCards = document.querySelectorAll(selectors.articleCard);

      // いずれかの条件を満たせばOK
      return hasResultText || articleCards.length > 0;
    },
    {
      loadingSpinner: SELECTORS.LOADING_SPINNER,
      searchResultText: SELECTORS.SEARCH_RESULT_TEXT,
      articleCard: SELECTORS.ARTICLE_CARD,
    },
    { timeout }
  );

  // 検索結果の安定を確認（状態ベースの待機）
  await page.waitForFunction(
    (selectors) => {
      const articles = document.querySelectorAll(selectors.articleCard);
      const emptyState = document.querySelector(selectors.emptyState);
      return articles.length > 0 || emptyState !== null;
    },
    {
      articleCard: SELECTORS.ARTICLE_CARD,
      emptyState: SELECTORS.EMPTY_STATE,
    },
    { timeout: 2000 }
  );
}