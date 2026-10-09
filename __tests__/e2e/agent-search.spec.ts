import { test, expect } from '@playwright/test';
import {
  MOCK_CACHED_RESPONSE,
  MOCK_FALLBACK_RESPONSE,
  MOCK_SUCCESS_RESPONSE,
  setupAgentSearchPage,
} from './helpers/agent-search-fixtures';

test.describe('AI Agent Search E2E', () => {
  test.beforeEach(async ({ page, context }) => {
    await setupAgentSearchPage(page, context);
  });

  test('0. CTA navigation from home page', async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await expect(page).toHaveURL('/');

    // Verify CTA is visible (feature flag ON)
    const ctaLink = page.getByRole('link', { name: /AI検索/ });
    await expect(ctaLink).toBeVisible();
    await expect(ctaLink).toHaveAttribute('href', '/search/agent');

    // Click CTA and verify navigation
    await ctaLink.click();
    await expect(page).toHaveURL('/search/agent');

    // Verify page loaded correctly (verify the search input)
    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await expect(input).toBeVisible({ timeout: 10000 });
  });
  test('1. Navigate to /search/agent and verify page loads', async ({
    page,
  }) => {
    await page.goto('/search/agent');
    await expect(page).toHaveURL('/search/agent');

    // Wait for page to render (Firefox needs explicit wait)
    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await expect(input).toBeVisible({ timeout: 10000 });
  });
  test('2. Enter query and verify loading state appears', async ({ page }) => {
    // Stub API with delay BEFORE navigation
    await page.route('**/api/rag/agent-search', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s delay
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      });
    });

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    // Verify loading state (using specific test id to avoid multiple role="status" elements)
    await expect(page.getByTestId('agent-loading-wrapper')).toBeVisible();
  });
  test('3. Successful search displays answer panel', async ({ page }) => {
    // Stub successful API response BEFORE navigation
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

    // Wait for answer panel
    await page.waitForSelector('text=AI回答', { timeout: 5000 });

    const answerPanel = page.locator('[role="article"]');
    await expect(answerPanel).toBeVisible();
    await expect(answerPanel).toContainText('テスト記事1');
  });
  test('4. Cached response displays cached badge', async ({ page }) => {
    // Setup route BEFORE navigation
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CACHED_RESPONSE),
      })
    );

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('text=AI回答', { timeout: 5000 });

    // Verify cached badge
    await expect(page.locator('text=キャッシュ')).toBeVisible();
  });
  test('5. Fallback response displays warning', async ({ page }) => {
    // Setup route BEFORE navigation
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_FALLBACK_RESPONSE),
      })
    );

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('text=AI回答', { timeout: 5000 });

    // Verify fallback warning
    await expect(
      page.locator('text=AI検索が一時的に利用できない')
    ).toBeVisible();
  });
  test('6. 401 error displays login prompt', async ({ page }) => {
    // Setup route BEFORE navigation
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    // Wait for error display
    await page.waitForSelector('text=認証が必要です', { timeout: 5000 });

    await expect(page.locator('text=認証が必要です')).toBeVisible();
    await expect(page.locator('button:has-text("ログイン")')).toBeVisible();
  });
  test('7. 429 error displays rate limit message with retry button', async ({
    page,
  }) => {
    // Setup route BEFORE navigation to ensure stub is active
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '60' },
        body: JSON.stringify({ error: 'Rate limit exceeded' }),
      })
    );

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('text=レート制限に達しました', {
      timeout: 5000,
    });

    await expect(page.locator('text=レート制限に達しました')).toBeVisible();
    await expect(page.locator('text=60秒後に再試行できます')).toBeVisible();
  });
  test('8. 500 error displays server error with retry button', async ({
    page,
  }) => {
    // Setup route BEFORE navigation
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    );

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('text=サーバーエラー', { timeout: 5000 });

    await expect(page.locator('text=サーバーエラー')).toBeVisible();
    await expect(page.locator('button:has-text("再試行")')).toBeVisible();
  });
  test('9. Retry button triggers new search', async ({ page }) => {
    let requestCount = 0;

    // Setup route BEFORE navigation
    await page.route('**/api/rag/agent-search', (route) => {
      requestCount++;
      if (requestCount === 1) {
        // First request fails with 500
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else {
        // Retry succeeds
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
        });
      }
    });

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    // Wait for error
    await page.waitForSelector('text=サーバーエラー', { timeout: 5000 });

    // Click retry
    await page.click('button:has-text("再試行")');

    // Wait for success
    await page.waitForSelector('text=AI回答', { timeout: 5000 });

    expect(requestCount).toBe(2);
    await expect(page.locator('[role="article"]')).toBeVisible();
  });
});
