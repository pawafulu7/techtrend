import { test, expect } from '@playwright/test';
import { loginTestUser } from './utils/e2e-helpers';

const MOCK_SUCCESS_RESPONSE = {
  query: 'test query',
  response: `# テスト回答

以下は、テストクエリに関する情報です:

1. **テスト記事1**
   - テスト内容1
   - 公開日: 2025年10月23日

2. **テスト記事2**
   - テスト内容2
   - 公開日: 2025年10月22日`,
  toolCalls: [
    { id: '1', name: 'semantic_search', input: { query: 'test', topK: 10 }, dynamic: false },
  ],
  usage: { totalTokens: 1234, promptTokens: 600, completionTokens: 634 },
  cached: false,
  fallback: false,
};

const MOCK_CACHED_RESPONSE = {
  ...MOCK_SUCCESS_RESPONSE,
  cached: true,
};

const MOCK_FALLBACK_RESPONSE = {
  ...MOCK_SUCCESS_RESPONSE,
  fallback: true,
};

test.describe('AI Agent Search E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login with test user to obtain real session cookies
    const loginSuccess = await loginTestUser(page);
    if (!loginSuccess) {
      throw new Error('Failed to login test user');
    }
  });

  test('1. Navigate to /search/agent and verify page loads', async ({ page }) => {
    await page.goto('/search/agent');
    await expect(page).toHaveURL('/search/agent');

    // Wait for page to render (Firefox needs explicit wait)
    const heading = page.getByRole('heading', { name: 'AI記事検索', level: 1 });
    await expect(heading).toBeVisible({ timeout: 10000 });

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await expect(input).toBeVisible();
  });

  test('2. Enter query and verify loading state appears', async ({ page }) => {
    await page.goto('/search/agent');

    // Stub API with delay
    await page.route('**/api/rag/agent-search', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s delay
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      });
    });

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    // Verify loading state
    await expect(page.locator('text=AIが要約を生成中')).toBeVisible();
  });

  test('3. Successful search displays answer panel', async ({ page }) => {
    await page.goto('/search/agent');

    // Stub successful API response
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      })
    );

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
    await page.goto('/search/agent');

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_CACHED_RESPONSE),
      })
    );

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('text=AI回答', { timeout: 5000 });

    // Verify cached badge
    await expect(page.locator('text=キャッシュ')).toBeVisible();
  });

  test('5. Fallback response displays warning', async ({ page }) => {
    await page.goto('/search/agent');

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_FALLBACK_RESPONSE),
      })
    );

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('text=AI回答', { timeout: 5000 });

    // Verify fallback warning
    await expect(page.locator('text=AI検索が一時的に利用できない')).toBeVisible();
  });

  test('6. 401 error displays login prompt', async ({ page }) => {
    await page.goto('/search/agent');

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' }),
      })
    );

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    // Wait for error display
    await page.waitForSelector('text=認証が必要です', { timeout: 5000 });

    await expect(page.locator('text=認証が必要です')).toBeVisible();
    await expect(page.locator('button:has-text("ログイン")')).toBeVisible();
  });

  test('7. 429 error displays rate limit message with retry button', async ({ page }) => {
    await page.goto('/search/agent');

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '60' },
        body: JSON.stringify({ error: 'Rate limit exceeded' }),
      })
    );

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('text=レート制限に達しました', { timeout: 5000 });

    await expect(page.locator('text=レート制限に達しました')).toBeVisible();
    await expect(page.locator('text=60秒後に再試行できます')).toBeVisible();
  });

  test('8. 500 error displays server error with retry button', async ({ page }) => {
    await page.goto('/search/agent');

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    );

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('text=サーバーエラー', { timeout: 5000 });

    await expect(page.locator('text=サーバーエラー')).toBeVisible();
    await expect(page.locator('button:has-text("再試行")')).toBeVisible();
  });

  test('9. Retry button triggers new search', async ({ page }) => {
    await page.goto('/search/agent');

    let requestCount = 0;

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

  test('10. Copy button copies answer to clipboard', async ({ page }) => {
    await page.goto('/search/agent');

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      })
    );

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('[role="article"]', { timeout: 5000 });

    // Click copy button (no grantPermissions needed - user gesture is sufficient)
    await page.click('button[aria-label="回答をコピー"]');

    // Verify checkmark appears (indicates copy succeeded)
    await expect(page.locator('svg.text-green-600')).toBeVisible({ timeout: 2000 });
  });

  test('11. Feedback buttons log correctly', async ({ page }) => {
    await page.goto('/search/agent');

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      })
    );

    // Capture console logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      consoleLogs.push(msg.text());
    });

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('test query');
    await input.press('Enter');

    await page.waitForSelector('[role="article"]', { timeout: 5000 });

    // Click thumbs up
    await page.click('button[aria-label="良い"]');

    // Verify console log
    await page.waitForTimeout(500);
    expect(consoleLogs.some((log) => log.includes('Feedback') && log.includes('positive'))).toBe(true);
  });

  test('12. Keyboard shortcut Cmd+Shift+K focuses input', async ({ page }) => {
    await page.goto('/search/agent');

    // Use unique selector to avoid strict mode violation
    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // Press Cmd+Shift+K (Meta on Mac, Control on Linux/Windows)
    // Send both modifiers to ensure cross-platform compatibility
    await page.keyboard.press('Meta+Shift+KeyK');

    // If Meta didn't work (Linux CI), try Control
    const isFocused = await input.evaluate((el) => document.activeElement === el);
    if (!isFocused) {
      await page.keyboard.press('Control+Shift+KeyK');
    }

    // Verify input is focused
    await expect(input).toBeFocused();
  });

  test('13. Search history suggestions display on focus', async ({ page }) => {
    await page.goto('/search/agent');

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_SUCCESS_RESPONSE),
      })
    );

    // Use unique selector to avoid strict mode violation
    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });

    // Perform a search to save to history
    await input.fill('historical query');
    await input.press('Enter');

    await page.waitForSelector('[role="article"]', { timeout: 5000 });

    // Wait for localStorage to be updated (Firefox is slower)
    await page.waitForFunction(
      () => {
        const history = localStorage.getItem('searchHistory');
        return history?.includes('historical query') ?? false;
      },
      { timeout: 3000 }
    );

    // Clear input and focus
    await input.fill('');
    await input.focus();

    // Verify suggestion dropdown with longer timeout for Firefox
    await expect(page.getByText('historical query')).toBeVisible({ timeout: 5000 });
  });
});
