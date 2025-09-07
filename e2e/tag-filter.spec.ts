import { test, expect } from '@playwright/test';

test.describe('タグフィルター機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 初期読み込み待機
    await page.waitForSelector('[data-testid="article-card"]', { timeout: 10000 });
  });

  test('タグフィルタードロップダウンが表示される', async ({ page }) => {
    // ヘッダーのタグフィルターボタンを探す
    const tagFilterButton = page.locator('button').filter({ hasText: /タグ|Tags/ });
    await expect(tagFilterButton).toBeVisible();
  });

  test.skip('タグ選択で記事がフィルタリングされる', async ({ page }) => {
    // 初期の記事数を取得
    const initialCount = await page.locator('[data-testid="article-card"]').count();
    
    // タグフィルターを開く
    const tagFilterButton = page.locator('button').filter({ hasText: /タグ|Tags/ });
    await tagFilterButton.click();
    
    // TypeScriptタグを選択（存在する場合）
    const typeScriptOption = page.locator('text=/TypeScript/i').first();
    if (await typeScriptOption.isVisible()) {
      await typeScriptOption.click();
      
      // フィルタリング後の待機
      await page.waitForTimeout(1000);
      
      // 記事数が変化したか確認
      const filteredCount = await page.locator('[data-testid="article-card"]').count();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test.skip('複数タグのOR検索が動作する', async ({ page }) => {
    // タグフィルターを開く
    const tagFilterButton = page.locator('button').filter({ hasText: /タグ|Tags/ });
    await tagFilterButton.click();
    
    // 複数タグを選択
    const reactTag = page.locator('text=/React/i').first();
    const typeScriptTag = page.locator('text=/TypeScript/i').first();
    
    if (await reactTag.isVisible() && await typeScriptTag.isVisible()) {
      await reactTag.click();
      await typeScriptTag.click();
      
      // フィルタリング待機
      await page.waitForTimeout(1000);
      
      // 記事が表示されていることを確認
      const articles = page.locator('[data-testid="article-card"]');
      await expect(articles.first()).toBeVisible();
    }
  });

  test('タグフィルターのクリアが動作する', async ({ page }) => {
    // タグフィルターを開く
    const tagFilterButton = page.locator('button').filter({ hasText: /タグ|Tags/ });
    await tagFilterButton.click();
    
    // タグを選択
    const firstTag = page.locator('input[type="checkbox"]').first();
    if (await firstTag.isVisible()) {
      await firstTag.click();
      await page.waitForTimeout(1000);
      
      // クリアボタンを探してクリック
      const clearButton = page.locator('button').filter({ hasText: /クリア|Clear|リセット|Reset/ });
      if (await clearButton.isVisible()) {
        await clearButton.click();
        await page.waitForTimeout(1000);
        
        // すべての記事が表示されることを確認
        const articles = page.locator('[data-testid="article-card"]');
        const count = await articles.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });
});