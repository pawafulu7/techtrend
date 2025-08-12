import { test, expect } from '@playwright/test';
import { testData } from '../fixtures/test-data';
import {
  waitForPageLoad,
  expectPageTitle,
  expectNoErrors,
  expectArticleCards,
} from '../utils/test-helpers';
import { SELECTORS } from '../constants/selectors';

test.describe('検索機能', () => {
  test.beforeEach(async ({ page }) => {
    // ホームページにアクセス
    await page.goto(testData.paths.home);
    await waitForPageLoad(page);
  });

  test('キーワード検索が機能する', async ({ page }) => {
    // 検索入力フィールドを探す（ホームページのSearchBoxコンポーネント）
    const searchInput = page.locator(SELECTORS.SEARCH_INPUT).first();
    
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
    await page.waitForSelector(SELECTORS.MAIN_CONTENT, { state: 'visible', timeout: 10000 });
    
    // メインコンテンツ内のローディングスピナーが消えるまで待機
    const mainLoader = page.locator(SELECTORS.LOADING_INDICATOR);
    if (await mainLoader.count() > 0) {
      await mainLoader.first().waitFor({ state: 'hidden', timeout: 10000 });
    }
    
    // 検索結果または「結果なし」メッセージを確認
    // APIレスポンスを待つ - より明確な条件で待機
    await page.waitForFunction(
      () => {
        const loader = document.querySelector('main .animate-spin, main [class*="loader"]');
        const resultCount = document.querySelector('p');
        return !loader && resultCount && (resultCount.textContent?.includes('件') || resultCount.textContent?.includes('結果'));
      },
      { timeout: 5000 }
    );
    
    // 検索結果カウントの表示を確認（「○○件」の形式）
    const resultCountText = page.locator(SELECTORS.SEARCH_RESULT_COUNT);
    
    // 件数表示が存在することを確認
    await expect(resultCountText).toBeVisible({ timeout: 5000 });
    
    // 件数が数値を含むことを確認
    const countText = await resultCountText.textContent();
    expect(countText).toMatch(/\d+件/);
  });

  test('空の検索クエリの処理', async ({ page }) => {
    const searchInput = page.locator(SELECTORS.SEARCH_INPUT).first();
    
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
    const searchInput = page.locator('input[type="text"][placeholder*="キーワードで記事を検索"]').first();
    
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
        // フィルター適用を待つ - URL変更を待機
        await page.waitForURL('**/source=**', { timeout: 5000 });
        
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
        // ソート適用を待つ - URL変更とデータ再読み込みを待機
        await Promise.all([
          page.waitForURL('**/sort=**', { timeout: 5000 }),
          page.waitForFunction(
            () => {
              const loader = document.querySelector('main .animate-spin, main [class*="loader"]');
              return !loader;
            },
            { timeout: 5000 }
          )
        ]);
        
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

  test('複数キーワードのAND検索が機能する', async ({ page }) => {
    const searchInput = page.locator('input[type="text"][placeholder*="キーワードで記事を検索"]').first();
    
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    
    // 複数キーワードを半角スペース区切りで入力
    await searchInput.fill('JavaScript React');
    await searchInput.press('Enter');
    
    // URLに検索パラメータが追加されることを確認（+または%20でエンコード）
    await expect(page).toHaveURL(/\?.*search=(JavaScript(%20|\+)React|JavaScript\+React)/, { timeout: 15000 });
    await waitForPageLoad(page);
    
    // エラーがないことを確認
    await expectNoErrors(page);
    
    // 検索結果のローディングが完了するまで待機
    await page.waitForSelector(SELECTORS.MAIN_CONTENT, { state: 'visible', timeout: 10000 });
    
    // メインコンテンツ内のローディングスピナーが消えるまで待機
    const mainLoader = page.locator(SELECTORS.LOADING_INDICATOR);
    if (await mainLoader.count() > 0) {
      await mainLoader.first().waitFor({ state: 'hidden', timeout: 10000 });
    }
    
    // 結果表示を待つ - ローダー消失と結果表示を確認
    await page.waitForFunction(
      () => {
        const loader = document.querySelector('main .animate-spin, main [class*="loader"]');
        const resultElement = document.querySelector('p');
        return !loader && resultElement && (resultElement.textContent?.includes('件') || resultElement.textContent?.includes('結果'));
      },
      { timeout: 5000 }
    );
    
    // 検索結果カウントの表示を確認
    const resultCountText = page.locator('p:has-text("件")');
    
    // 件数表示が存在することを確認
    if (await resultCountText.isVisible()) {
      const countText = await resultCountText.textContent();
      expect(countText).toMatch(/\d+件/);
    }
  });

  test('全角スペース区切りの複数キーワード検索', async ({ page }) => {
    const searchInput = page.locator('input[type="text"][placeholder*="キーワードで記事を検索"]').first();
    
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    
    // 全角スペース区切りで複数キーワードを入力
    await searchInput.fill('TypeScript　Vue');
    await searchInput.press('Enter');
    
    // URLに検索パラメータが追加されることを確認
    await expect(page).toHaveURL(/\?.*search=/, { timeout: 15000 });
    await waitForPageLoad(page);
    
    // エラーがないことを確認
    await expectNoErrors(page);
    
    // 検索結果が表示されることを確認
    await page.waitForSelector('main', { state: 'visible', timeout: 10000 });
  });

  test.skip('高度な検索オプション（機能削除済み）', async ({ page }) => {
    // この機能は削除されました
  });

  test.skip('検索履歴・候補の表示（SearchBar削除により無効）', async ({ page }) => {
    // SearchBarコンポーネントが削除されたため、この機能は現在利用不可
  });
});