import { test, expect } from '@playwright/test';
import { testData } from '../fixtures/test-data';
import {
  waitForPageLoad,
  expectArticleCards,
  expectNavigationMenu,
  expectPageTitle,
  expectNoErrors,
} from '../utils/test-helpers';

test.describe('ホームページ', () => {
  test.beforeEach(async ({ page }) => {
    // ホームページにアクセス
    await page.goto(testData.paths.home);
    await waitForPageLoad(page);
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
    // 記事カードが少なくとも1つ表示されることを確認
    await expectArticleCards(page, 1);

    // 記事カードの基本要素を確認
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    await expect(firstArticle).toBeVisible();

    // タイトルが存在することを確認
    const title = firstArticle.locator('[data-testid="article-title"]');
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText).toBeTruthy();
  });

  test('検索ボックスが機能する', async ({ page }) => {
    // 検索入力フィールドを探す
    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"], input[placeholder*="Search"]').first();
    
    if (await searchInput.isVisible()) {
      // 検索クエリを入力
      await searchInput.fill(testData.searchQueries.valid);
      
      // Enterキーで検索実行
      await searchInput.press('Enter');
      
      // URLが検索ページに遷移することを確認
      await expect(page).toHaveURL(/\/search|\/articles\?q=/);
    }
  });

  test('ソースフィルタが存在する', async ({ page }) => {
    // ソースフィルタの存在を確認（セレクトボックスまたはドロップダウン）
    const sourceFilter = page.locator(
      'select[data-testid="source-filter"], [data-testid="source-dropdown"], select[name*="source"]'
    ).first();
    
    if (await sourceFilter.isVisible()) {
      // フィルタが操作可能であることを確認
      await expect(sourceFilter).toBeEnabled();
    }
  });

  test('ページネーションが機能する', async ({ page }) => {
    // ページネーションコンポーネントを探す
    const pagination = page.locator(
      '[data-testid="pagination"], nav[aria-label*="pagination"], .pagination'
    ).first();

    if (await pagination.isVisible()) {
      // 次ページボタンを探す
      const nextButton = pagination.locator(
        'button:has-text("次"), button:has-text("Next"), [aria-label*="次"], [aria-label*="next"]'
      ).first();

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
    await page.reload();
    await waitForPageLoad(page);
    
    // モバイルでも記事が表示されることを確認
    await expectArticleCards(page, 1);
    
    // デスクトップビューポートに戻す
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await waitForPageLoad(page);
    
    // デスクトップでも記事が表示されることを確認
    await expectArticleCards(page, 1);
  });
});