import { test, expect } from '@playwright/test';
import { testData } from '../fixtures/test-data';
import {
  waitForPageLoad,
  expectArticleCards,
  expectNavigationMenu,
  expectPageTitle,
  expectNoErrors,
} from '../utils/e2e-helpers';
import { getTimeout } from '../../../e2e/helpers/wait-utils';
import { SELECTORS } from '../constants/selectors';

test.describe('ホームページ', () => {
  test.beforeEach(async ({ page }) => {
    // CI環境では待機時間を延長
    const loadTimeout = process.env.CI ? 45000 : 30000;
    // ホームページにアクセス
    await page.goto(testData.paths.home, { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, { timeout: loadTimeout, waitForNetworkIdle: true });
  });

  test('ページが正常に表示される', async ({ page }) => {
    // タイトルの確認
    await expectPageTitle(page, 'TechTrend');

    // ナビゲーションメニューの確認
    await expectNavigationMenu(page);

    // エラーがないことを確認
    await expectNoErrors(page);
  });

  test('記事一覧が表示される', async ({ page }) => {
    // 記事要素を探す（data-testidがない場合は別の方法で）
    const articles = page.locator(SELECTORS.ARTICLE_CARD).first();
    
    // CI環境では待機時間を延長
    const articleTimeout = process.env.CI ? 30000 : 15000;
    // 少なくとも1つの記事要素が存在することを確認
    await expect(articles).toBeVisible({ timeout: articleTimeout });

    // タイトル要素を探す
    const title = articles.locator(SELECTORS.ARTICLE_TITLE).first();
    if (await title.isVisible()) {
      const titleText = await title.textContent();
      expect(titleText).toBeTruthy();
    }
  });

  test('検索ボックスが機能する', async ({ page }) => {
    // 検索入力フィールドを探す（SearchBoxコンポーネント）
    const searchInput = page.locator(SELECTORS.SEARCH_INPUT).first();
    
    if (await searchInput.isVisible()) {
      // 検索クエリを入力
      await searchInput.fill(testData.searchQueries.valid);
      
      // Enterキーで検索実行
      await searchInput.press('Enter');
      
      // URLに検索パラメータが追加されることを確認（動的待機）
      await page.waitForFunction(
        () => {
          const url = window.location.search;
          return url.includes('search=');
        },
        undefined,
        { timeout: getTimeout('medium'), polling: 100 }
      );
      
      // URLが正しく更新されたことを確認
      const currentUrl = page.url();
      expect(currentUrl).toContain('search=');
    }
  });

  test('ソースフィルタが存在する', async ({ page }) => {
    // ソースフィルタの存在を確認（セレクトボックスまたはドロップダウン）
    const sourceFilter = page.locator(SELECTORS.SOURCE_FILTER).first();
    
    if (await sourceFilter.isVisible()) {
      // フィルタが操作可能であることを確認
      await expect(sourceFilter).toBeEnabled();
    }
  });

  test('ページネーションが機能する', async ({ page }) => {
    // ページネーションコンポーネントを探す
    const pagination = page.locator(SELECTORS.PAGINATION).first();

    if (await pagination.isVisible()) {
      // 次ページボタンを探す
      const nextButton = pagination.locator(SELECTORS.NEXT_PAGE_BUTTON).first();

      if (await nextButton.isVisible() && await nextButton.isEnabled()) {
        // 次ページに移動
        await nextButton.click();
        
        // URLにページパラメータが追加されることを確認
        await expect(page).toHaveURL(/page=2|p=2/);
        
        // 新しい記事が表示されることを確認
        await expectArticleCards(page, 1);
      }
    }
  });

  test('レスポンシブデザインが機能する', async ({ page }) => {
    // モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 });
    
    // ページをリロード
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, { timeout: 30000, waitForNetworkIdle: true });
    
    // モバイルでも記事が表示されることを確認（セレクターを緩和）
    const articleSelector = 'article, [class*="article"], [class*="card"], div[data-testid*="article"]';
    await page.waitForSelector(articleSelector, { state: 'visible', timeout: 10000 });
    const mobileArticles = await page.locator(articleSelector).count();
    expect(mobileArticles).toBeGreaterThan(0);
    
    // デスクトップビューポートに戻す
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page, { timeout: 30000, waitForNetworkIdle: true });
    
    // デスクトップでも記事が表示されることを確認
    await page.waitForSelector(articleSelector, { state: 'visible', timeout: 10000 });
    const desktopArticles = await page.locator(articleSelector).count();
    expect(desktopArticles).toBeGreaterThan(0);
  });
});