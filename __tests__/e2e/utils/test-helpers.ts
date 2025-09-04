import { Page, expect } from '@playwright/test';
import { SELECTORS } from '../constants/selectors';

/**
 * ページの読み込みが完了するまで待機
 * 注: 開発サーバーは常時起動（http://localhost:3000）
 */
export async function waitForPageLoad(page: Page) {
  // ブラウザ判定を追加
  const browserName = page.context().browser()?.browserType().name();
  
  if (browserName === 'firefox') {
    // Firefoxはより慎重な待機
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000); // 500ms → 1000ms
    
    // 追加で初期レンダリング完了を確認
    await page.evaluate(() => {
      return new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve(true);
        } else {
          window.addEventListener('load', () => resolve(true));
        }
      });
    });
  } else {
    // その他のブラウザは現行通り
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
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
  await page.waitForFunction(
    () => {
      const loader = document.querySelector('.loading, .animate-spin, [class*="loader"]');
      const hasData = document.querySelector('[data-loaded="true"], main [class*="card"], main article');
      return !loader && hasData;
    },
    { timeout }
  );
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
    ({ selector, expectedText }) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const text = element.textContent || '';
      
      if (typeof expectedText === 'string') {
        return text.includes(expectedText);
      } else {
        // RegExpオブジェクトは直接渡せないため、文字列として処理
        const pattern = new RegExp(expectedText.toString().slice(1, -1));
        return pattern.test(text);
      }
    },
    { selector, expectedText: expectedText instanceof RegExp ? expectedText.toString() : expectedText },
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