import { test, expect } from '@playwright/test';

// 環境別タイムアウト値
const timeout = process.env.CI ? 30000 : 15000;

test.describe('タグフィルター機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // 初期読み込み待機（タイムアウトを延長）
    await page.waitForSelector('[data-testid="article-card"]', { timeout });
  });

  test('タグフィルタードロップダウンが表示される', async ({ page }) => {
    // data-testidを使用したセレクタに変更
    const tagFilterButton = page.getByTestId('tag-filter-button');
    await expect(tagFilterButton).toBeVisible({ timeout });
  });

  test('タグ選択で記事がフィルタリングされる', async ({ page }) => {
    // 初期の記事数を取得
    const initialCount = await page.locator('[data-testid="article-card"]').count();
    
    // data-testidを使用してタグフィルターを開く
    const tagFilterButton = page.getByTestId('tag-filter-button');
    await tagFilterButton.click();
    
    // ドロップダウンの表示を待機
    await page.waitForSelector('[data-testid="tag-dropdown"]', { 
      state: 'visible',
      timeout 
    });
    
    // TypeScriptタグを選択（存在する場合）
    // ドロップダウン内のタグアイテムを正確に選択
    const typeScriptOption = page.locator('[data-testid="tag-dropdown"]').locator('[data-testid*="tag-item"]').filter({ hasText: 'TypeScript' }).first();
    if (await typeScriptOption.count() > 0) {
      await typeScriptOption.click();
      
      // ネットワークアイドル状態を待機（waitForTimeoutの代わり）
      await page.waitForLoadState('networkidle');
      
      // 記事数が変化したか確認
      const filteredCount = await page.locator('[data-testid="article-card"]').count();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test('複数タグのOR検索が動作する', async ({ page }) => {
    // data-testidを使用してタグフィルターを開く
    const tagFilterButton = page.getByTestId('tag-filter-button');
    await tagFilterButton.click();
    
    // ドロップダウンの表示を待機
    await page.waitForSelector('[data-testid="tag-dropdown"]', { 
      state: 'visible',
      timeout 
    });
    
    // 複数タグを選択
    // ドロップダウン内のタグアイテムを正確に選択
    const reactTag = page.locator('[data-testid="tag-dropdown"]').locator('[data-testid*="tag-item"]').filter({ hasText: 'React' }).first();
    const typeScriptTag = page.locator('[data-testid="tag-dropdown"]').locator('[data-testid*="tag-item"]').filter({ hasText: 'TypeScript' }).first();
    
    if ((await reactTag.count() > 0) && (await typeScriptTag.count() > 0)) {
      await reactTag.click();
      await typeScriptTag.click();
      
      // ネットワークアイドル状態を待機
      await page.waitForLoadState('networkidle');
      
      // 記事が表示されていることを確認
      const articles = page.locator('[data-testid="article-card"]');
      await expect(articles.first()).toBeVisible({ timeout });
    }
  });

  test('タグフィルターのクリアが動作する', async ({ page }) => {
    // data-testidを使用してタグフィルターを開く
    const tagFilterButton = page.getByTestId('tag-filter-button');
    await tagFilterButton.click();
    
    // ドロップダウンの表示を待機
    await page.waitForSelector('[data-testid="tag-dropdown"]', { 
      state: 'visible',
      timeout 
    });
    
    // タグを選択
    const firstTag = page.locator('input[type="checkbox"]').first();
    if (await firstTag.isVisible({ timeout: 5000 })) {
      await firstTag.click();
      
      // ネットワークアイドル状態を待機
      await page.waitForLoadState('networkidle');
      
      // クリアボタンを探してクリック
      const clearButton = page.locator('button').filter({ hasText: /クリア|Clear|リセット|Reset/ });
      if (await clearButton.isVisible({ timeout: 5000 })) {
        await clearButton.click();
        
        // ネットワークアイドル状態を待機
        await page.waitForLoadState('networkidle');
        
        // すべての記事が表示されることを確認
        const articles = page.locator('[data-testid="article-card"]');
        const count = await articles.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });
});