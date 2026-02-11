import { test, expect } from '@playwright/test';
import { waitForUrlParam, getTimeout, waitForArticles, openFilterSidebar } from '../../e2e/helpers/wait-utils';

// Desktop viewport for sidebar visibility
test.use({
  viewport: { width: 1280, height: 720 }
});

test.describe('Date Range Filter', () => {
  // Shared robust date range selection with retries
  type DateRangeValue = 'today' | 'week' | 'month' | 'three_months' | 'clear' | string;

  async function selectDateRangeGlobal(
    page: import('@playwright/test').Page,
    label: string,
    value: DateRangeValue
  ) {
    const combobox = page.getByTestId('date-range-trigger');
    const listbox = page.locator('[role="listbox"]');
    for (let attempt = 0; attempt < 3; attempt++) {
      await combobox.click();
      await expect(listbox).toBeVisible({ timeout: 5000 });
      await page.locator('[role="listbox"]').getByRole('option', { name: label }).click();
      try {
        if (value === 'clear') {
          await expect
            .poll(() => new URL(page.url()).searchParams.get('dateRange'), {
              timeout: getTimeout('short')
            })
            .toBeNull();
        } else {
          await waitForUrlParam(page, 'dateRange', String(value), { timeout: getTimeout('short') });
        }
        await expect(combobox).toContainText(label, { timeout: getTimeout('short') });
        await expect(listbox).toBeHidden({ timeout: 5000 });
        return;
      } catch {
        try {
          await expect(combobox).toContainText(label, { timeout: 3000 });
          await expect(listbox).toBeHidden({ timeout: 5000 });
          if (value === 'clear') {
            const param = new URL(page.url()).searchParams.get('dateRange');
            if (param !== null) {
              throw new Error('dateRange param still present');
            }
          }
          return;
        } catch {}
      }
      await page.waitForTimeout(500);
    }
    throw new Error(`Failed to select date range: ${label}`);
  }
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for articles to load with deterministic waiting
    await waitForArticles(page, {
      timeout: getTimeout('medium'),
      waitForNetworkIdle: false,
      allowEmpty: true,
    });

    // サイドバーを開く（デフォルト閉じのため）
    await openFilterSidebar(page);

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

    // 「全期間」に戻す
    await selectDateRangeGlobal(page, '全期間', 'clear');

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

    // サイドバーを再度開く（リロードで閉じるため）
    await openFilterSidebar(page);

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

  test('should display calendar trigger button', async ({ page }) => {
    const calendarBtn = page.getByTestId('date-range-calendar-trigger');
    await expect(calendarBtn).toBeVisible();
    await expect(calendarBtn).toHaveAttribute('aria-label', 'カレンダーで日付を選択');
  });

  test('should open calendar popover via custom option', async ({ page }) => {
    const combobox = page.getByTestId('date-range-trigger');
    const listbox = page.locator('[role="listbox"]');

    // Open dropdown and select "カスタム..."
    await combobox.click();
    await expect(listbox).toBeVisible({ timeout: 5000 });

    // Verify "カスタム..." option exists
    const customOption = listbox.getByRole('option', { name: 'カスタム...' });
    await expect(customOption).toBeVisible();
    await customOption.click();

    // Calendar popover should open
    const calendar = page.getByTestId('date-range-calendar');
    await expect(calendar).toBeVisible({ timeout: 5000 });

    // Apply and Cancel buttons should be visible
    await expect(page.getByTestId('date-range-calendar-apply')).toBeVisible();
    await expect(page.getByTestId('date-range-calendar-cancel')).toBeVisible();

    // Apply button should be disabled (no dates selected yet)
    await expect(page.getByTestId('date-range-calendar-apply')).toBeDisabled();
  });

  test('should close calendar popover via cancel', async ({ page }) => {
    // Open calendar via button
    const calendarBtn = page.getByTestId('date-range-calendar-trigger');
    await calendarBtn.click();

    const calendar = page.getByTestId('date-range-calendar');
    await expect(calendar).toBeVisible({ timeout: 5000 });

    // Click cancel
    await page.getByTestId('date-range-calendar-cancel').click();

    // Calendar should close
    await expect(calendar).toBeHidden({ timeout: 5000 });

    // URL should not have dateFrom/dateTo params
    const url = new URL(page.url());
    expect(url.searchParams.get('dateFrom')).toBeNull();
    expect(url.searchParams.get('dateTo')).toBeNull();
  });

  test('should select custom date range and apply', async ({ page }) => {
    // Open calendar
    const calendarBtn = page.getByTestId('date-range-calendar-trigger');
    await calendarBtn.click();

    const calendar = page.getByTestId('date-range-calendar');
    await expect(calendar).toBeVisible({ timeout: 5000 });

    // Click on two day buttons within the calendar to select a range
    // We need to find clickable day buttons that are not disabled
    const dayButtons = calendar.locator('button[data-day]').filter({
      has: page.locator(':not([disabled])'),
    });

    const availableDays = await dayButtons.count();
    if (availableDays >= 2) {
      // Click the first available day (range start)
      await dayButtons.first().click();

      // Apply button should now be enabled (single day = from only)
      await expect(page.getByTestId('date-range-calendar-apply')).toBeEnabled({ timeout: 3000 });

      // Click a second day (range end) - pick one a few days later
      const secondDayIndex = Math.min(4, availableDays - 1);
      await dayButtons.nth(secondDayIndex).click();

      // Apply the selection
      await page.getByTestId('date-range-calendar-apply').click();

      // Calendar should close
      await expect(calendar).toBeHidden({ timeout: 5000 });

      // URL should have dateFrom and dateTo params
      await expect
        .poll(() => {
          const url = new URL(page.url());
          return url.searchParams.get('dateFrom');
        }, { timeout: getTimeout('short') })
        .toBeTruthy();

      await expect
        .poll(() => {
          const url = new URL(page.url());
          return url.searchParams.get('dateTo');
        }, { timeout: getTimeout('short') })
        .toBeTruthy();

      // dateRange preset param should NOT be present
      const finalUrl = new URL(page.url());
      expect(finalUrl.searchParams.get('dateRange')).toBeNull();

      // Calendar button should have active styling (border-primary)
      await expect(calendarBtn).toHaveClass(/border-primary/);
    }
  });

  test('should switch from custom range back to preset', async ({ page }) => {
    // First set a custom range via URL
    await page.goto('/?dateFrom=2026-01-01&dateTo=2026-01-31', {
      waitUntil: 'domcontentloaded',
    });
    await waitForArticles(page, {
      timeout: getTimeout('medium'),
      waitForNetworkIdle: false,
      allowEmpty: true,
    });

    // サイドバーを開く（ページ遷移後）
    await openFilterSidebar(page);

    // Verify custom mode is active
    const calendarBtn = page.getByTestId('date-range-calendar-trigger');
    await expect(calendarBtn).toHaveClass(/border-primary/, { timeout: 5000 });

    // Switch to a preset
    await selectDateRangeGlobal(page, '今週', 'week');

    // dateFrom/dateTo should be removed from URL
    await expect
      .poll(() => {
        const url = new URL(page.url());
        return url.searchParams.get('dateFrom');
      }, { timeout: getTimeout('short') })
      .toBeNull();

    // Calendar button should no longer have active styling
    await expect(calendarBtn).not.toHaveClass(/border-primary/);
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
