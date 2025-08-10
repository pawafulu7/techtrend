import { test, expect } from '@playwright/test';
import { testData } from '../fixtures/test-data';
import {
  waitForPageLoad,
  expectPageTitle,
  expectNoErrors,
  expectArticleCards,
} from '../utils/test-helpers';

test.describe('検索機能', () => {
  test.beforeEach(async ({ page }) => {
    // ホームページにアクセス
    await page.goto(testData.paths.home);
    await waitForPageLoad(page);
  });

  test('キーワード検索が機能する', async ({ page }) => {
    // 検索入力フィールドを探す
    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"], input[placeholder*="Search"]').first();
    
    await expect(searchInput).toBeVisible();
    
    // 検索キーワードを入力
    await searchInput.fill('JavaScript');
    
    // Enterキーで検索実行
    await searchInput.press('Enter');
    
    // 検索結果ページへの遷移を確認
    await expect(page).toHaveURL(/\/search|\/articles\?q=/);
    await waitForPageLoad(page);
    
    // エラーがないことを確認
    await expectNoErrors(page);
    
    // 検索結果が表示されることを確認
    const searchResults = page.locator('article, [class*="article"], [class*="card"]');
    const resultsCount = await searchResults.count();
    
    // 検索結果が0件以上であることを確認（0件の場合は「結果なし」メッセージが表示されるはず）
    if (resultsCount > 0) {
      // 少なくとも最初の結果が表示されることを確認
      await expect(searchResults.first()).toBeVisible();
    } else {
      // 結果なしメッセージを確認
      const noResultsMessage = page.locator(':text("見つかりません"), :text("No results"), :text("該当なし")').first();
      await expect(noResultsMessage).toBeVisible();
    }
  });

  test('空の検索クエリの処理', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"]').first();
    
    await expect(searchInput).toBeVisible();
    
    // 空の検索を実行
    await searchInput.fill('');
    await searchInput.press('Enter');
    
    // ホームページに留まるか、全記事が表示されることを確認
    const currentUrl = page.url();
    const isHome = currentUrl.endsWith('/') || currentUrl.includes('/articles');
    expect(isHome).toBeTruthy();
    
    // 記事が表示されることを確認
    await expectArticleCards(page, 1);
  });

  test('特殊文字を含む検索クエリの処理', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"]').first();
    
    await expect(searchInput).toBeVisible();
    
    // 特殊文字を含む検索クエリ
    const specialQuery = '<script>alert("test")</script>';
    await searchInput.fill(specialQuery);
    await searchInput.press('Enter');
    
    await waitForPageLoad(page);
    
    // XSS攻撃が実行されないことを確認（アラートが表示されない）
    await expectNoErrors(page);
    
    // ページが正常に表示されることを確認
    const pageContent = page.locator('body');
    await expect(pageContent).toBeVisible();
  });

  test('検索フィルターが機能する', async ({ page }) => {
    // 検索ページへ直接アクセス
    await page.goto('/search?q=test');
    await waitForPageLoad(page);
    
    // ソースフィルターを探す
    const sourceFilter = page.locator(
      'select[name*="source"], select[data-testid="source-filter"], [data-testid="source-dropdown"]'
    ).first();
    
    if (await sourceFilter.isVisible()) {
      // フィルターオプションを取得
      const options = await sourceFilter.locator('option').allTextContents();
      
      // オプションが複数存在することを確認
      expect(options.length).toBeGreaterThan(1);
      
      // 特定のソースを選択（存在する場合）
      if (options.includes('Dev.to')) {
        await sourceFilter.selectOption({ label: 'Dev.to' });
        await page.waitForTimeout(1000); // フィルター適用を待つ
        
        // URLパラメータが更新されることを確認
        const currentUrl = page.url();
        expect(currentUrl).toContain('source');
      }
    }
    
    // 日付フィルターを探す
    const dateFilter = page.locator(
      'select[name*="date"], input[type="date"], [data-testid="date-filter"]'
    ).first();
    
    if (await dateFilter.isVisible()) {
      // 日付フィルターが操作可能であることを確認
      await expect(dateFilter).toBeEnabled();
    }
  });

  test('検索結果のソート機能', async ({ page }) => {
    // 検索を実行
    await page.goto('/search?q=JavaScript');
    await waitForPageLoad(page);
    
    // ソートオプションを探す
    const sortSelect = page.locator(
      'select[name*="sort"], select[data-testid="sort"], [data-testid="sort-dropdown"]'
    ).first();
    
    if (await sortSelect.isVisible()) {
      // ソートオプションを取得
      const sortOptions = await sortSelect.locator('option').allTextContents();
      
      // 複数のソートオプションが存在することを確認
      expect(sortOptions.length).toBeGreaterThan(1);
      
      // 日付順でソート
      if (sortOptions.some(opt => opt.includes('新着') || opt.includes('Date'))) {
        const dateOption = sortOptions.find(opt => opt.includes('新着') || opt.includes('Date'));
        await sortSelect.selectOption({ label: dateOption });
        await page.waitForTimeout(1000);
        
        // URLパラメータにソート情報が追加されることを確認
        const currentUrl = page.url();
        expect(currentUrl).toContain('sort');
      }
    }
  });

  test('検索結果のページネーション', async ({ page }) => {
    // 一般的なキーワードで検索（結果が多いことを期待）
    await page.goto('/search?q=a');
    await waitForPageLoad(page);
    
    // ページネーションコンポーネントを探す
    const pagination = page.locator(
      '[data-testid="pagination"], nav[aria-label*="pagination"], .pagination'
    ).first();
    
    if (await pagination.isVisible()) {
      // 次ページボタンを探す
      const nextButton = pagination.locator(
        'button:has-text("次"), button:has-text("Next"), [aria-label*="次"]'
      ).first();
      
      if (await nextButton.isVisible() && await nextButton.isEnabled()) {
        // 現在のページ番号を記録
        const initialUrl = page.url();
        
        // 次ページへ移動
        await nextButton.click();
        await waitForPageLoad(page);
        
        // URLが変更されたことを確認
        const newUrl = page.url();
        expect(newUrl).not.toBe(initialUrl);
        expect(newUrl).toMatch(/page=\d+|p=\d+/);
        
        // 新しい記事が表示されることを確認
        await expectArticleCards(page, 1);
      }
    }
  });

  test('高度な検索オプション', async ({ page }) => {
    // 検索ページへアクセス
    await page.goto('/search');
    await waitForPageLoad(page);
    
    // 高度な検索オプションを探す
    const advancedSearchToggle = page.locator(
      'button:has-text("詳細検索"), button:has-text("Advanced"), [data-testid="advanced-search"]'
    ).first();
    
    if (await advancedSearchToggle.isVisible()) {
      // 高度な検索オプションを開く
      await advancedSearchToggle.click();
      
      // 追加の検索フィールドが表示されることを確認
      const advancedFields = page.locator('[class*="advanced"], [data-testid*="advanced"]');
      const fieldsCount = await advancedFields.count();
      expect(fieldsCount).toBeGreaterThan(0);
      
      // タグ検索フィールドを探す
      const tagInput = page.locator(
        'input[name*="tag"], input[placeholder*="タグ"], [data-testid="tag-input"]'
      ).first();
      
      if (await tagInput.isVisible()) {
        await tagInput.fill('React');
        
        // 検索実行
        const searchButton = page.locator('button[type="submit"], button:has-text("検索")').first();
        if (await searchButton.isVisible()) {
          await searchButton.click();
          await waitForPageLoad(page);
          
          // URLにタグパラメータが含まれることを確認
          const currentUrl = page.url();
          expect(currentUrl).toContain('tag');
        }
      }
    }
  });

  test('検索履歴・候補の表示', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"]').first();
    
    await expect(searchInput).toBeVisible();
    
    // 検索フィールドにフォーカス
    await searchInput.focus();
    
    // 文字を入力し始める
    await searchInput.type('Java', { delay: 100 });
    
    // サジェスト/オートコンプリートが表示されるか確認
    const suggestions = page.locator(
      '[role="listbox"], [class*="suggest"], [class*="autocomplete"], [data-testid="suggestions"]'
    ).first();
    
    // サジェストが表示される場合
    if (await suggestions.isVisible({ timeout: 2000 })) {
      // サジェスト項目が存在することを確認
      const suggestionItems = suggestions.locator('[role="option"], li');
      const itemCount = await suggestionItems.count();
      expect(itemCount).toBeGreaterThan(0);
      
      // 最初のサジェストをクリック
      if (itemCount > 0) {
        await suggestionItems.first().click();
        await waitForPageLoad(page);
        
        // 検索が実行されることを確認
        await expect(page).toHaveURL(/\/search|q=/);
      }
    }
  });
});