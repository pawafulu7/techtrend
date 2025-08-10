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
    // 検索入力フィールドを探す（実際のページに合わせたセレクター）
    const searchInput = page.locator('input[type="search"][placeholder*="記事を検索"]').first();
    
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    
    // 検索キーワードを入力
    await searchInput.fill('JavaScript');
    
    // Enterキーで検索実行
    await searchInput.press('Enter');
    
    // ホームページで検索パラメータが追加されることを確認
    await expect(page).toHaveURL(/\?.*search=/, { timeout: 15000 });
    await waitForPageLoad(page);
    
    // エラーがないことを確認
    await expectNoErrors(page);
    
    // 検索結果のローディングが完了するまで待機
    await page.waitForSelector('main', { state: 'visible', timeout: 10000 });
    
    // メインコンテンツ内のローディングスピナーが消えるまで待機
    const mainLoader = page.locator('main .animate-spin, main [class*="loader"]');
    if (await mainLoader.count() > 0) {
      await mainLoader.first().waitFor({ state: 'hidden', timeout: 10000 });
    }
    
    // 検索結果または「結果なし」メッセージを確認
    await page.waitForTimeout(1000); // APIレスポンスを待つ
    
    // 検索結果カウントの表示を確認
    const resultCountText = page.locator('p:has-text("件の記事が見つかりました")');
    const noResultsText = page.locator(':text("検索条件に一致する記事が見つかりませんでした"), :text("検索キーワードを入力してください")');
    
    // いずれかのメッセージが表示されることを確認
    const hasResultCount = await resultCountText.isVisible({ timeout: 5000 }).catch(() => false);
    const hasNoResults = await noResultsText.isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasResultCount || hasNoResults).toBeTruthy();
  });

  test('空の検索クエリの処理', async ({ page }) => {
    const searchInput = page.locator('input[type="search"][placeholder*="記事を検索"]').first();
    
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
    const searchInput = page.locator('input[type="search"][placeholder*="記事を検索"]').first();
    
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
    // ホームページで検索を実行
    await page.goto('/?search=test');
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
    await page.goto('/?search=JavaScript');
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
    await page.goto('/?search=a');
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

  test.skip('高度な検索オプション（機能削除済み）', async ({ page }) => {
    // この機能は削除されました
  });

  test('検索履歴・候補の表示', async ({ page }) => {
    const searchInput = page.locator('input[type="search"][placeholder*="記事を検索"]').first();
    
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
        await expect(page).toHaveURL(/search=/);
      }
    }
  });
});