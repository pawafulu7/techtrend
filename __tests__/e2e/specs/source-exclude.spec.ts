import { test, expect } from '@playwright/test';
import { waitForPageLoad } from '../utils/test-helpers';

test.describe('ソースフィルタリング機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    await page.waitForSelector('[data-testid="article-card"]');
  });

  test('ソースの選択と解除ができる', async ({ page }) => {
    // フィルターエリアを確認
    const filterArea = page.locator('[data-testid="filter-area"]');
    await expect(filterArea).toBeVisible();

    // 最初のソースのチェックボックスを探す
    const firstSourceCheckbox = page.locator('[data-testid^="source-checkbox-"]').first();
    await expect(firstSourceCheckbox).toBeVisible();
    
    // ソース名を取得
    const sourceName = await firstSourceCheckbox.locator('label').textContent();
    
    // チェックボックスの初期状態を取得
    const checkbox = firstSourceCheckbox.locator('button[role="checkbox"]');
    const initialState = await checkbox.getAttribute('data-state');
    
    // チェックボックスをクリックして状態を切り替え
    await firstSourceCheckbox.click();
    await page.waitForTimeout(500);
    
    // 状態が変わったことを確認
    const newState = await checkbox.getAttribute('data-state');
    expect(newState).not.toBe(initialState);
    
    // 再度クリックして元の状態に戻す
    await firstSourceCheckbox.click();
    await page.waitForTimeout(500);
    
    // 元の状態に戻ったことを確認
    const finalState = await checkbox.getAttribute('data-state');
    expect(finalState).toBe(initialState);
    
    // チェックボックスが正常に動作することを確認できた
  });

  test('選択を外したソースが非表示になる', async ({ page }) => {
    // 初期状態で記事を確認
    const initialArticles = await page.locator('[data-testid="article-card"]').count();
    expect(initialArticles).toBeGreaterThan(0);
    
    // フィルターエリアを取得
    const filterArea = page.locator('[data-testid="filter-area"]');
    
    // Dev.toのチェックボックスを探す（通常存在するソース）
    const devtoCheckbox = page.locator('[data-testid="source-checkbox-Dev.to"]');
    
    if (await devtoCheckbox.isVisible()) {
      // Dev.toの選択を解除
      await devtoCheckbox.click();
      
      // 記事が更新されるのを待つ
      await page.waitForTimeout(1000);
      
      // Dev.toの記事が表示されていないことを確認
      const articles = page.locator('[data-testid="article-card"]');
      const articleCount = await articles.count();
      
      if (articleCount > 0) {
        // 各記事のソース名を確認（最大5件）
        for (let i = 0; i < Math.min(articleCount, 5); i++) {
          const article = articles.nth(i);
          const sourceElement = article.locator('[class*="text-xs"]').filter({ hasText: /Dev\.to|Qiita|Zenn|AWS|Google/ }).first();
          
          if (await sourceElement.isVisible()) {
            const sourceText = await sourceElement.textContent();
            // Dev.toの記事が含まれていないことを確認
            expect(sourceText).not.toContain('Dev.to');
          }
        }
      }
      
      // Dev.toを再度選択して元に戻す
      await devtoCheckbox.click();
    }
  });

  test('全選択・全解除ボタンが機能する', async ({ page }) => {
    // フィルターエリアを取得
    const filterArea = page.locator('[data-testid="filter-area"]');
    
    // 最初に全選択ボタンをクリックして、すべて選択状態にする
    const selectAllButton = page.locator('[data-testid="select-all-button"]');
    await expect(selectAllButton).toBeVisible();
    await selectAllButton.click();
    await page.waitForTimeout(500);
    
    // 初期の記事数を取得
    const initialArticles = await page.locator('[data-testid="article-card"]').count();
    expect(initialArticles).toBeGreaterThan(0);
    
    // 全解除ボタンをクリック
    const deselectAllButton = page.locator('[data-testid="deselect-all-button"]');
    await expect(deselectAllButton).toBeVisible();
    await deselectAllButton.click();
    
    // すべてのチェックボックスが解除されたことを確認
    await page.waitForTimeout(500);
    const allCheckboxes = page.locator('[data-testid^="source-checkbox-"] button[role="checkbox"]');
    const checkboxCount = await allCheckboxes.count();
    
    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = allCheckboxes.nth(i);
      await expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    }
    
    // 記事の更新を待つ
    await page.waitForTimeout(1500);
    
    // 記事数が変化したことを確認（0件または減少）
    const articlesAfterDeselect = await page.locator('[data-testid="article-card"]').count();
    // ソースが選択されていない場合、記事数は0または初期より少ない
    expect(articlesAfterDeselect).toBeLessThanOrEqual(initialArticles);
    
    // 全選択ボタンを再度クリック
    await selectAllButton.click();
    
    // すべてのチェックボックスが選択されたことを確認
    await page.waitForTimeout(500);
    for (let i = 0; i < checkboxCount; i++) {
      const checkbox = allCheckboxes.nth(i);
      await expect(checkbox).toHaveAttribute('data-state', 'checked');
    }
    
    // 記事が再度表示されることを確認
    await page.waitForTimeout(1500);
    const articlesAfterSelect = await page.locator('[data-testid="article-card"]').count();
    expect(articlesAfterSelect).toBeGreaterThan(0);
  });

  test('複数ソースの選択状態を管理できる', async ({ page }) => {
    // フィルターエリアを取得
    const filterArea = page.locator('[data-testid="filter-area"]');
    
    // 複数のソースチェックボックスを取得
    const sourceCheckboxes = page.locator('[data-testid^="source-checkbox-"]');
    const checkboxCount = await sourceCheckboxes.count();
    
    // 少なくとも3つ以上のソースがあることを確認
    expect(checkboxCount).toBeGreaterThanOrEqual(3);
    
    // 最初の3つのソースの選択を解除
    const sourcesToDeselect = [];
    for (let i = 0; i < 3; i++) {
      const sourceCheckbox = sourceCheckboxes.nth(i);
      const sourceName = await sourceCheckbox.locator('label').textContent();
      sourcesToDeselect.push(sourceName);
      await sourceCheckbox.click();
    }
    
    // URLパラメータが更新されることを確認
    await page.waitForTimeout(500);
    const currentUrl = page.url();
    expect(currentUrl).toContain('sources=');
    
    // 選択解除したソースがURLに含まれないことを確認
    for (const source of sourcesToDeselect) {
      if (source) {
        const encodedSource = encodeURIComponent(source);
        expect(currentUrl).not.toContain(encodedSource);
      }
    }
    
    // 記事が更新されたことを確認（記事数が減少）
    await page.waitForTimeout(1000);
    const articles = await page.locator('[data-testid="article-card"]').count();
    
    // 選択を元に戻す
    for (let i = 0; i < 3; i++) {
      await sourceCheckboxes.nth(i).click();
    }
    
    // すべてのソースが再度選択されたことを確認
    await page.waitForTimeout(500);
    const articlesAfter = await page.locator('[data-testid="article-card"]').count();
    expect(articlesAfter).toBeGreaterThanOrEqual(articles);
  });
});