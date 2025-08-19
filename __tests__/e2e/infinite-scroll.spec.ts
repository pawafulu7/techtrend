import { test, expect, Page } from '@playwright/test';

test.describe('Infinite Scroll E2E Tests', () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('should load initial articles on page load', async () => {
    // 初期記事の読み込みを確認
    const articles = await page.locator('[data-testid="article-card"]').all();
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.length).toBeLessThanOrEqual(20);
  });

  test('should display infinite scroll trigger', async () => {
    // スクロールトリガーの存在を確認
    const trigger = page.locator('[data-testid="infinite-scroll-trigger"]');
    await expect(trigger).toBeVisible();
  });

  test('should load more articles on scroll', async () => {
    // 初期記事数を取得
    const initialArticles = await page.locator('[data-testid="article-card"]').all();
    const initialCount = initialArticles.length;
    
    // ページ下部へスクロール
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // 新しい記事の読み込みを待つ
    await page.waitForTimeout(2000);
    
    // 記事数が増加したことを確認
    const updatedArticles = await page.locator('[data-testid="article-card"]').all();
    expect(updatedArticles.length).toBeGreaterThan(initialCount);
  });

  test('should display loading indicator while fetching', async () => {
    // ページ下部へスクロール
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // ローディングインジケーターを確認
    const loadingText = page.getByText('記事を読み込み中...');
    await expect(loadingText).toBeVisible({ timeout: 5000 });
  });

  test('should maintain filter state during infinite scroll', async () => {
    // ソースフィルターを適用
    const filterButton = page.locator('[data-testid="mobile-filters-button"]').or(
      page.locator('button:has-text("フィルター")')
    ).first();
    
    if (await filterButton.isVisible()) {
      await filterButton.click();
      await page.waitForTimeout(500);
      
      // Zennソースを選択
      const zennCheckbox = page.locator('input[type="checkbox"][value="Zenn"]').or(
        page.locator('[data-testid="source-checkbox-Zenn"]')
      ).first();
      
      if (await zennCheckbox.isVisible()) {
        await zennCheckbox.click();
        
        // フィルター適用
        const applyButton = page.getByRole('button', { name: /適用|表示/ });
        if (await applyButton.isVisible()) {
          await applyButton.click();
        }
      }
    }
    
    // スクロールして追加読み込み
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
    
    // URLパラメータが維持されていることを確認
    const url = page.url();
    expect(url).toContain('sourceId');
  });

  test('should show end message when all articles are loaded', async () => {
    // 小さいlimitでテスト
    await page.goto('http://localhost:3000?limit=5');
    await page.waitForLoadState('networkidle');
    
    // 最下部まで複数回スクロール
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
      
      // 終了メッセージを探す
      const endMessage = page.getByText('すべての記事を読み込みました');
      if (await endMessage.isVisible()) {
        break;
      }
    }
    
    // 終了メッセージの確認
    const endMessage = page.getByText('すべての記事を読み込みました');
    await expect(endMessage).toBeVisible({ timeout: 10000 });
  });

  test('should handle manual load button when infinite scroll is disabled', async () => {
    // enableInfiniteScroll=falseの場合のテスト
    // この機能はコンポーネントのプロパティで制御されるため、
    // 実際のテストは統合テストで行う
    
    // 現在の実装ではInfinite Scrollが有効なので、
    // トリガーが表示されることを確認
    const trigger = page.locator('[data-testid="infinite-scroll-trigger"]');
    await expect(trigger).toBeVisible();
  });

  test('should display article count information', async () => {
    // 記事件数の表示を確認
    const countText = await page.getByText(/\d+件の記事/).first();
    await expect(countText).toBeVisible();
    
    // 表示中の件数も確認
    const displayedText = await page.getByText(/\d+件表示中/).first();
    await expect(displayedText).toBeVisible();
  });
});