import { test, expect } from '@playwright/test';
import {
  MOCK_SUCCESS_RESPONSE,
  setupAgentSearchPage,
} from './helpers/agent-search-fixtures';

test.describe('AI Agent Search E2E: 操作', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAgentSearchPage(page, context);
  });

  test('10. Copy button copies answer to clipboard', async ({ page }) => {
    // Setup route BEFORE navigation
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      })
    );

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('[role="article"]', { timeout: 5000 });

    // Click copy button
    await page.click('button[aria-label="回答をコピー"]');

    // Wait for "コピー完了" text to appear
    await expect(page.getByText('コピー完了')).toBeVisible({ timeout: 3000 });

    // Verify clipboard content (using stubbed clipboard API)
    const copiedText = await page.evaluate(
      () => (window as any).__lastCopiedText__
    );
    expect(copiedText).toContain('テスト記事1');
  });
  test('11. Feedback buttons log correctly', async ({ page }) => {
    // Setup route BEFORE navigation
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      })
    );

    await page.goto('/search/agent');

    // Capture console logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('[role="article"]', { timeout: 5000 });

    // Click thumbs up (aria-label changed from "良い" to "役立った")
    await page.click('button[aria-label="役立った"]');

    // Verify console log
    await page.waitForTimeout(500);
    expect(
      consoleLogs.some(
        (log) => log.includes('Feedback') && log.includes('positive')
      )
    ).toBe(true);
  });
  test('12. Keyboard shortcut Cmd+Shift+K focuses input', async ({ page }) => {
    await page.goto('/search/agent');

    // Use unique selector to avoid strict mode violation
    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // Press Cmd+Shift+K (Meta on Mac, Control on Linux/Windows)
    // Send both modifiers to ensure cross-platform compatibility
    await page.keyboard.press('Meta+Shift+KeyK');

    // If Meta didn't work (Linux CI), try Control
    const isFocused = await input.evaluate(
      (el) => document.activeElement === el
    );
    if (!isFocused) {
      await page.keyboard.press('Control+Shift+KeyK');
    }

    // Verify input is focused
    await expect(input).toBeFocused();
  });
  test('13. Search history suggestions display and allow editing before search', async ({
    page,
  }) => {
    // Setup route BEFORE navigation
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      })
    );

    await page.goto('/search/agent');

    // Use unique selector to avoid strict mode violation
    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // Perform a search to save to history
    await input.fill('historical query');
    await input.press('Enter');

    await page.waitForSelector('[role="article"]', { timeout: 5000 });

    // Wait for localStorage to be updated (Firefox is slower)
    // Note: searchHistoryV2 uses {query, timestamp} format
    await page.waitForFunction(
      () => {
        const history = localStorage.getItem('searchHistoryV2');
        if (!history) return false;
        try {
          const parsed = JSON.parse(history) as Array<{
            query: string;
            timestamp: number;
          }>;
          return parsed.some((item) => item.query === 'historical query');
        } catch {
          return false;
        }
      },
      { timeout: 5000 }
    );

    // Clear input
    await input.fill('');

    // Firefox needs explicit blur→focus to trigger focus event
    await input.blur();
    await input.focus();

    // Ensure input is focused
    await expect(input).toBeFocused();

    // Wait for both conditions: focus held + suggestions rendered (deterministic)
    // Note: suggestions now include timestamps, so use partial match
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const input = document.querySelector(
              '[data-testid="agent-search-input"]'
            );
            const active = document.activeElement === input;
            const suggestions = Array.from(
              document.querySelectorAll(
                '[data-testid="search-history-suggestion"]'
              )
            ).map((el) => el.textContent?.trim());
            return (
              active && suggestions.some((s) => s?.includes('historical query'))
            );
          }),
        { timeout: 10000 }
      )
      .toBeTruthy();

    // Verify suggestion dropdown container is visible
    const suggestionList = page.getByTestId('search-history-suggestions');
    await expect(suggestionList).toBeVisible();

    // Verify specific suggestion
    const suggestion = suggestionList
      .getByTestId('search-history-suggestion')
      .filter({ hasText: 'historical query' });
    await expect(suggestion).toBeVisible();

    // NEW: Verify history click does NOT trigger immediate search
    let requestFired = false;
    page.on('request', (req) => {
      if (
        req.url().includes('/api/rag/agent-search') &&
        req.method() === 'POST'
      ) {
        requestFired = true;
      }
    });

    // Click suggestion
    await suggestion.click();

    // Wait briefly and verify no request was fired
    await page.waitForTimeout(500);
    expect(requestFired).toBe(false);

    // Verify input has the suggestion value
    await expect(input).toHaveValue('historical query');

    // Verify input is focused for editing
    await expect(input).toBeFocused();

    // Verify suggestions are hidden
    await expect(suggestionList).not.toBeVisible();

    // NEW: Verify Enter key triggers search
    const agentSearchResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/rag/agent-search') && res.status() === 200,
      { timeout: 30000 }
    );

    await input.press('Enter');

    // Verify search was executed (extended timeout for progressive threshold fallback)
    await agentSearchResponse;

    // Verify results are displayed
    await expect(page.locator('[role="article"]')).toBeVisible();
  });
  test('14. Sample query chip prefills input and runs search', async ({
    page,
  }) => {
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      })
    );

    await page.goto('/search/agent');
    await page.waitForLoadState('networkidle');

    // Wait for page to fully render
    await page.waitForTimeout(1000);

    // Sidebar uses accordion layout: click category to expand, then click query
    const categoryToggle = page.getByTestId('category-toggle-infrastructure');
    await categoryToggle.waitFor({ state: 'visible', timeout: 15000 });
    await categoryToggle.click();

    // Click the first query button in the expanded category
    const queryButton = page.getByTestId('category-query-q1');
    await queryButton.waitFor({ state: 'visible', timeout: 5000 });
    await queryButton.click();

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await expect(input).toHaveValue('AWS最新機能アップデート速報');

    // Use specific selector for search button to avoid matching category tiles
    await page
      .getByTestId('agent-search-card')
      .getByRole('button', { name: '検索' })
      .click();

    await expect(page.getByRole('heading', { name: 'AI回答' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('[role="article"]')).toContainText('テスト記事1');
  });
});
