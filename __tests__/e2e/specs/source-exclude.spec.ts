import { test, expect } from '@playwright/test';

test.describe('ソース除外機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="article-card"]');
  });

  test.skip('除外モードへの切り替えができる', async ({ page }) => {
    // 機能未実装のため一時スキップ
    // フィルターエリアを確認
    const filterArea = page.locator('.bg-white\\/80').first();
    await expect(filterArea).toBeVisible();

    // 初期状態は「表示」モード
    const toggleButton = filterArea.locator('button').filter({ hasText: '表示' });
    await expect(toggleButton).toBeVisible();

    // クリックして「除外」モードに切り替え
    await toggleButton.click();
    
    // ボタンテキストが「除外」に変わることを確認
    const excludeButton = filterArea.locator('button').filter({ hasText: '除外' });
    await expect(excludeButton).toBeVisible();
  });

  test.skip('ソースの除外と解除ができる', async ({ page }) => {
    // 機能未実装のため一時スキップ
    // フィルターエリアを取得
    const filterArea = page.locator('.bg-white\\/80').first();
    
    // 除外モードに切り替え
    const toggleButton = filterArea.locator('button').filter({ hasText: '表示' });
    await toggleButton.click();

    // はてなブックマークを除外
    const hatenaButton = filterArea.locator('button').filter({ hasText: 'はてなブックマーク' });
    if (await hatenaButton.count() > 0) {
      await hatenaButton.click();

      // URLにexcludeSourceIdパラメータが追加されることを確認
      await expect(page).toHaveURL(/excludeSourceId=%E3%81%AF%E3%81%A6%E3%81%AA%E3%83%96%E3%83%83%E3%82%AF%E3%83%9E%E3%83%BC%E3%82%AF/);

      // 除外中エリアが表示されることを確認
      const excludedArea = page.locator('.bg-red-50');
      await expect(excludedArea).toBeVisible();

      // クリアボタンで除外を解除
      const clearButton = excludedArea.locator('button').filter({ hasText: 'クリア' });
      await clearButton.click();

      // URLから除外パラメータが削除されることを確認
      await expect(page).not.toHaveURL(/excludeSourceId/);
    }
  });

  test.skip('除外したソースの記事が表示されないことを確認', async ({ page }) => {
    // 機能未実装のため一時スキップ
    // 初期状態で記事を確認
    await page.waitForSelector('[data-testid="article-card"]');
    
    // フィルターエリアを取得
    const filterArea = page.locator('.bg-white\\/80').first();
    
    // 除外モードに切り替え
    const toggleButton = filterArea.locator('button').filter({ hasText: '表示' });
    await toggleButton.click();

    // 最初のソースを除外
    const sourceButtons = filterArea.locator('button').filter({ hasNot: page.locator('text=/すべて|表示|除外/') });
    const firstSourceButton = sourceButtons.first();
    const sourceName = await firstSourceButton.textContent();
    
    if (sourceName) {
      await firstSourceButton.click();

      // 記事が更新されるのを待つ
      await page.waitForTimeout(1000);

      // 除外したソースの記事が表示されていないことを確認
      const articles = page.locator('[data-testid="article-card"]');
      const articleCount = await articles.count();
      
      if (articleCount > 0) {
        // 各記事のソース名を確認
        for (let i = 0; i < Math.min(articleCount, 5); i++) {
          const article = articles.nth(i);
          const sourceText = await article.locator('text=/Zenn|Qiita|Dev\\.to|はてなブックマーク|Corporate Tech Blog|Google Developers Blog|AWS|Think IT|Publickey|Stack Overflow Blog|Speaker Deck/').textContent();
          
          // 除外したソースの記事が含まれていないことを確認
          expect(sourceText).not.toBe(sourceName);
        }
      }
    }
  });
});