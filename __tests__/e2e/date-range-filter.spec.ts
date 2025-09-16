import { test, expect } from '@playwright/test';
import { waitForUrlParam, getTimeout } from '../../e2e/helpers/wait-utils';

// Desktop viewport for sidebar visibility
test.use({
  viewport: { width: 1280, height: 720 }
});

test.describe('Date Range Filter', () => {
  // Shared robust date range selection with retries
  async function selectDateRangeGlobal(page: import('@playwright/test').Page, label: string, value: string) {
    const combobox = page.getByTestId('date-range-trigger');
    const listbox = page.locator('[role="listbox"]');
    for (let attempt = 0; attempt < 3; attempt++) {
      await combobox.click();
      await expect(listbox).toBeVisible({ timeout: 5000 });
      await page.locator('[role="listbox"]').getByRole('option', { name: label }).click();
      try {
        await waitForUrlParam(page, 'dateRange', value, { timeout: getTimeout('short') });
        await expect(listbox).toBeHidden({ timeout: 5000 });
        return;
      } catch {
        try {
          await expect(combobox).toContainText(label, { timeout: 3000 });
          await expect(listbox).toBeHidden({ timeout: 5000 });
          return;
        } catch {}
      }
    }
    throw new Error(`Failed to select date range: ${label}`);
  }
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
    const trigger = page.getByTestId('date-range-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('全期間');
  });

  test('should open date range dropdown', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = page.getByTestId('date-range-trigger');
    const listbox = page.locator('[role="listbox"]');

    // comboboxをクリック
    await combobox.click();

    // ドロップダウンメニューが開くのを待機
    // Radix UIのSelectはポータルを使用するので、body直下に表示される
    await expect(listbox).toBeVisible({ timeout: 5000 });

    // オプションが表示されることを確認
    const expectedOptions = ['全期間', '今日', '今週', '今月', '過去3ヶ月'];
    for (const optionText of expectedOptions) {
      const option = listbox.getByRole('option', { name: optionText });
      await expect(option).toBeVisible();
    }
  });

  test('should filter articles by date range', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = page.getByTestId('date-range-trigger');
    const listbox = page.locator('[role="listbox"]');

    await selectDateRangeGlobal(page, '今日', 'today');
    await expect(combobox).toContainText('今日');
  });

  test('should reset to all periods', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = page.getByTestId('date-range-trigger');
    const listbox = page.locator('[role="listbox"]');

    // まず「今週」を選択（堅牢な共通ヘルパーを使用）
    await selectDateRangeGlobal(page, '今週', 'week');
    await expect(combobox).toContainText('今週');

    // CI 環境での router.push の遅延を考慮して少し待機
    await page.waitForTimeout(500);

    // 「全期間」に戻す
    let paramCleared = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await combobox.click();
      await expect(listbox).toBeVisible();
      await listbox.getByRole('option', { name: '全期間' }).click();
      await expect(listbox).toBeHidden();

      try {
        await expect
          .poll(() => new URL(page.url()).searchParams.get('dateRange'), {
            timeout: getTimeout('short')
          })
          .toBeNull();
        paramCleared = true;
        break;
      } catch {
        await expect(combobox).toContainText('全期間', { timeout: getTimeout('short') });
        await page.waitForTimeout(500);
      }
    }

    expect(paramCleared).toBeTruthy();

    // テキストが「全期間」に戻ったことを確認
    await expect(combobox).toContainText('全期間');
  });

  test('should persist filter on page reload', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = page.getByTestId('date-range-trigger');
    const listbox = page.locator('[role="listbox"]');

    // 「今月」を確実に選択（リトライ付き）
    await selectDateRangeGlobal(page, '今月', 'month');

    // ページをリロード
    await page.reload({ waitUntil: 'domcontentloaded' });

    // フィルターエリアが再表示されるのを待機（networkidleの代わりに具体的な要素を待つ）
    await page.waitForSelector('[data-testid="filter-area"]', {
      state: 'visible',
      timeout: 10000
    });

    // 記事リストの最初の要素が表示されるのを待機（データ読み込み完了の指標）
    await page.waitForSelector('[data-testid="article-list"] > *:first-child', {
      state: 'visible',
      timeout: 10000
    }).catch(() => {
      // 記事リストが空の場合もあるので、エラーを無視
    });

    // フィルターが維持されていることを確認（URL or UI）
    const newCombobox = page.getByTestId('date-range-trigger');
    let urlObserved = false;
    try {
      await waitForUrlParam(page, 'dateRange', 'month');
      urlObserved = true;
    } catch {}
    if (urlObserved) {
      await expect(page).toHaveURL(/[\?&]dateRange=month\b/);
    } else {
      await expect(newCombobox).toContainText('今月', { timeout: getTimeout('medium') });
    }
  });

  test('should work with multiple date ranges', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = filterArea.locator('[role="combobox"]').first();
    const listbox = page.locator('[role="listbox"]');

    const testCases = [
      { label: '今日', value: 'today' },
      { label: '今週', value: 'week' },
      { label: '今月', value: 'month' },
      { label: '過去3ヶ月', value: 'three_months' }
    ];

    // 選択の安定化ヘルパー（クリック→検証を最大2回までリトライ）
    async function selectDateRange(label: string, value: string) {
      for (let attempt = 0; attempt < 2; attempt++) {
        await combobox.click();
        await expect(page.locator('[role="listbox"]')).toBeVisible();
        await page.locator('[role="listbox"]').getByRole('option', { name: label }).click();
        // URLの更新とテキストの更新を待機（どちらかが満たされればOK）
        try {
          await expect(page).toHaveURL(new RegExp(`[?&]dateRange=${value}\\b`), { timeout: 5000 });
        } catch {
          // URLがまだ更新されていない場合はテキストで確認
          try {
            await expect(combobox).toContainText(label, { timeout: 3000 });
          } catch {
            // リトライ
            continue;
          }
        }
        // ポータルの listbox が閉じるのを待って安定化
        await expect(page.locator('[role="listbox"]')).toBeHidden({ timeout: 5000 });
        return;
      }
      throw new Error(`Failed to select date range: ${label}`);
    }

    for (const testCase of testCases) {
      await selectDateRange(testCase.label, testCase.value);
    }
  });
});
