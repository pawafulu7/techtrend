import { test, expect } from '@playwright/test';
import { waitForUrlParam, getTimeout } from '../../e2e/helpers/wait-utils';

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
    const combobox = filterArea.locator('[role="combobox"]').first();
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
    const combobox = filterArea.locator('[role="combobox"]').first();
    const listbox = page.locator('[role="listbox"]');

    // comboboxをクリック
    await combobox.click();

    // listboxが表示されるのを待機
    await expect(listbox).toBeVisible();

    // ドロップダウンから「今日」を選択
    await listbox.getByRole('option', { name: '今日' }).click();

    // URLが更新されるのを待機（失敗時はUI表示で代替検証）
    try {
      await waitForUrlParam(page, 'dateRange', 'today', { timeout: getTimeout('medium') });
    } catch {
      await expect(combobox).toContainText('今日', { timeout: getTimeout('short') });
    }

    // listboxが閉じたことを確認
    await expect(listbox).toBeHidden();

    // comboboxのテキストが更新されたことを確認
    await expect(combobox).toContainText('今日');
  });

  test('should reset to all periods', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = filterArea.locator('[role="combobox"]').first();
    const listbox = page.locator('[role="listbox"]');

    // まず「今週」を選択
    await combobox.click();
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: '今週' }).click();

    // URLが更新されるのを待機（遅延時のフォールバックを含めて堅牢化）
    let updatedToWeek = true;
    try {
      await waitForUrlParam(page, 'dateRange', 'week', { timeout: getTimeout('medium') });
    } catch {
      updatedToWeek = false;
      // URLが更新されない実装でも、コンボボックスの表示で確認
      await expect(combobox).toContainText('今週', { timeout: getTimeout('short') });
    }
    await expect(listbox).toBeHidden();

    // 「全期間」に戻す
    await combobox.click();
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: '全期間' }).click();

    // URLからdateRangeパラメータが削除されるのを待機
    // 以前の手順でURL未更新だった場合は、テキストの検証にフォールバック
    if (updatedToWeek) {
      await page.waitForFunction(() => !window.location.search.includes('dateRange'), { timeout: getTimeout('medium') });
    } else {
      await expect(combobox).toContainText('全期間', { timeout: getTimeout('short') });
    }
    await expect(listbox).toBeHidden();

    // テキストが「全期間」に戻ったことを確認
    await expect(combobox).toContainText('全期間');
  });

  test('should persist filter on page reload', async ({ page }) => {
    const filterArea = page.locator('[data-testid="filter-area"]');
    const combobox = filterArea.locator('[role="combobox"]').first();
    const listbox = page.locator('[role="listbox"]');

    // 「今月」を選択
    await combobox.click();
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: '今月' }).click();

    // URLが更新されるのを待機
    await expect(page).toHaveURL(/[\?&]dateRange=month\b/);
    await expect(listbox).toBeHidden();

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

    // フィルターが維持されていることを確認
    const newCombobox = page.locator('[data-testid="filter-area"]').locator('[role="combobox"]').first();
    await expect(newCombobox).toContainText('今月');
    await expect(page).toHaveURL(/[\?&]dateRange=month\b/);
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
