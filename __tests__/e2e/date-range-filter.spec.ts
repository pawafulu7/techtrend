import { test, expect } from '@playwright/test';

// Desktop viewport for sidebar visibility
test.use({
  viewport: { width: 1280, height: 720 }
});

test.describe('Date Range Filter', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Wait for the filter area to be present
    await page.waitForSelector('[data-testid="filter-area"]', {
      state: 'visible',
      timeout: 30000
    });
  });

  test('should display date range filter', async ({ page }) => {
    // フィルターエリアが存在することを確認
    const filterArea = page.locator('[data-testid="filter-area"]');
    await expect(filterArea).toBeVisible();

    // カレンダーアイコンと「全期間」を含むセレクトボックスを探す
    // Selectコンポーネントは role="combobox" としてレンダリングされる
    const dateFilterContainer = filterArea.locator('div').filter({ hasText: '全期間' }).first();
    await expect(dateFilterContainer).toBeVisible();

    // comboboxが存在することを確認
    const combobox = filterArea.locator('[role="combobox"]').first();
    await expect(combobox).toBeVisible();

    // デフォルト値が「全期間」であることを確認
    await expect(combobox).toContainText('全期間');
  });

  test('should open date range dropdown', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');

    // comboboxをクリック
    const combobox = filterArea.locator('[role="combobox"]').first();
    await combobox.click();

    // ドロップダウンメニューが開くのを待機
    // Radix UIのSelectはポータルを使用するので、body直下に表示される
    const dropdown = page.locator('[role="listbox"]');
    await expect(dropdown).toBeVisible({ timeout: 5000 });

    // オプションが表示されることを確認
    const expectedOptions = ['全期間', '今日', '今週', '今月', '過去3ヶ月'];
    for (const optionText of expectedOptions) {
      const option = dropdown.locator('[role="option"]').filter({ hasText: optionText });
      await expect(option).toBeVisible();
    }
  });

  test('should filter articles by date range', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');

    // comboboxをクリック
    const combobox = filterArea.locator('[role="combobox"]').first();
    await combobox.click();

    // ドロップダウンから「今日」を選択
    const dropdown = page.locator('[role="listbox"]');
    await dropdown.locator('[role="option"]').filter({ hasText: '今日' }).click();

    // URLが更新されるのを待機
    await page.waitForFunction(
      () => window.location.href.includes('dateRange=today'),
      { timeout: 5000 }
    );

    // comboboxのテキストが更新されたことを確認
    await expect(combobox).toContainText('今日');
  });

  test('should reset to all periods', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = filterArea.locator('[role="combobox"]').first();

    // まず「今週」を選択
    await combobox.click();
    await page.locator('[role="listbox"]').locator('[role="option"]').filter({ hasText: '今週' }).click();

    // URLが更新されるのを待機
    await page.waitForFunction(
      () => window.location.href.includes('dateRange=week'),
      { timeout: 5000 }
    );

    // 「全期間」に戻す
    await combobox.click();
    await page.locator('[role="listbox"]').locator('[role="option"]').filter({ hasText: '全期間' }).click();

    // URLからdateRangeパラメータが削除されるのを待機
    await page.waitForFunction(
      () => !window.location.href.includes('dateRange'),
      { timeout: 5000 }
    );

    // テキストが「全期間」に戻ったことを確認
    await expect(combobox).toContainText('全期間');
  });

  test('should persist filter on page reload', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = filterArea.locator('[role="combobox"]').first();

    // 「今月」を選択
    await combobox.click();
    await page.locator('[role="listbox"]').locator('[role="option"]').filter({ hasText: '今月' }).click();

    // URLが更新されるのを待機
    await page.waitForFunction(
      () => window.location.href.includes('dateRange=month'),
      { timeout: 5000 }
    );

    // ページをリロード
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');

    // フィルターエリアが再表示されるのを待機
    await page.waitForSelector('[data-testid="filter-area"]', {
      state: 'visible',
      timeout: 10000
    });

    // フィルターが維持されていることを確認
    const newCombobox = page.locator('[data-testid="filter-area"]').locator('[role="combobox"]').first();
    await expect(newCombobox).toContainText('今月');
    expect(page.url()).toContain('dateRange=month');
  });

  test('should work with multiple date ranges', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = filterArea.locator('[role="combobox"]').first();

    const testCases = [
      { label: '今日', value: 'today' },
      { label: '今週', value: 'week' },
      { label: '今月', value: 'month' },
      { label: '過去3ヶ月', value: '3months' }
    ];

    for (const testCase of testCases) {
      // comboboxをクリック
      await combobox.click();

      // オプションを選択
      await page.locator('[role="listbox"]').locator('[role="option"]').filter({ hasText: testCase.label }).click();

      // URLが更新されるのを待機
      await page.waitForFunction(
        (expectedValue) => window.location.href.includes(`dateRange=${expectedValue}`),
        testCase.value,
        { timeout: 5000 }
      );

      // テキストが更新されたことを確認
      await expect(combobox).toContainText(testCase.label);

      // 次のテストのために少し待機
      await page.waitForTimeout(500);
    }
  });
});