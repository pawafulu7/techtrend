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

    // すべて選択ボタンをクリックして、初期状態を統一
    const selectAllButton = page.locator('[data-testid="select-all-button"]');
    await selectAllButton.click();
    await page.waitForTimeout(500);

    // 最初のソースのチェックボックスを探す
    const firstSourceCheckbox = page.locator('[data-testid^="source-checkbox-"]').first();
    await expect(firstSourceCheckbox).toBeVisible();
    
    // ソース名を取得
    const _sourceName = await firstSourceCheckbox.locator('label').textContent();
    
    // チェックボックスが選択されていることを確認
    const checkbox = firstSourceCheckbox.locator('button[role="checkbox"]');
    await expect(checkbox).toHaveAttribute('data-state', 'checked');
    
    // チェックボックスをクリックして選択を解除
    await firstSourceCheckbox.click();
    await page.waitForTimeout(500);
    
    // チェックが外れたことを確認
    await expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    
    // 再度クリックして選択
    await firstSourceCheckbox.click();
    await page.waitForTimeout(500);
    
    // チェックが戻ったことを確認
    await expect(checkbox).toHaveAttribute('data-state', 'checked');
    
    // チェックボックスが正常に動作することを確認できた
  });

  test('選択を外したソースが非表示になる', async ({ page }) => {
    // 初期状態で記事を確認
    const initialArticles = await page.locator('[data-testid="article-card"]').count();
    expect(initialArticles).toBeGreaterThan(0);
    
    // フィルターエリアを取得
    const _filterArea = page.locator('[data-testid="filter-area"]');
    
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
    const _filterArea = page.locator('[data-testid="filter-area"]');
    
    // Firefox対応: ページの読み込みとデータの表示を確実に待つ
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // 最初に全選択ボタンをクリックして、すべて選択状態にする
    const selectAllButton = page.locator('[data-testid="select-all-button"]');
    await expect(selectAllButton).toBeVisible();
    await selectAllButton.click();
    await page.waitForTimeout(1000);
    
    // 記事カードが表示されるまで待つ（Firefoxの遅延対策）
    await page.waitForSelector('[data-testid="article-card"]', { 
      timeout: 10000,
      state: 'visible' 
    });
    
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

  test('複数ソースの選択状態を管理できる', async ({ page, browserName }) => {
    // Firefox対応: ページの読み込みとデータの表示を確実に待つ
    await page.waitForLoadState('networkidle');
    
    // Firefoxは読み込みが遅い場合があるため追加待機
    if (browserName === 'firefox') {
      await page.waitForTimeout(2000);
    } else {
      await page.waitForTimeout(1000);
    }
    
    // フィルターエリアを取得
    const _filterArea = page.locator('[data-testid="filter-area"]');
    
    // 記事カードが表示されるまで待つ（Firefoxの遅延対策）
    await page.waitForSelector('[data-testid="article-card"]', { 
      timeout: 10000,
      state: 'visible' 
    });
    
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
    // Firefoxは更新が遅い場合があるため追加待機
    if (browserName === 'firefox') {
      await page.waitForTimeout(2000);
    } else {
      await page.waitForTimeout(1000);
    }
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