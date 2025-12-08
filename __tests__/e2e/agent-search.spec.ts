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

const MOCK_EMPTY_RESPONSE = {
  query: 'xyzabc123nonsense',
  response: '',
  toolCalls: [],
  usage: { totalTokens: 0, promptTokens: 0, completionTokens: 0 },
  cached: false,
  fallback: false,
  articles: [],
};

test.describe('AI Agent Search E2E', () => {
  test.beforeEach(async ({ page, context }) => {
    // Login with test user to obtain real session cookies
    const loginSuccess = await loginTestUser(page);
    if (!loginSuccess) {
      throw new Error('Failed to login test user');
    }

    // Stub clipboard API for deterministic testing (works in headless/CI)
    await context.addInitScript(() => {
      const writes: string[] = [];
      Object.defineProperty(window.navigator, 'clipboard', {
        value: {
          writeText: async (text: string) => {
            writes.push(text);
            (window as any).__lastCopiedText__ = text;
            return Promise.resolve();
          },
        },
        configurable: true,
      });
    });
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

    // Verify page loaded correctly
    const heading = page.getByRole('heading', { name: 'AI記事検索', level: 1 });
    await expect(heading).toBeVisible({ timeout: 10000 });
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
    await expect(page.locator('text=AI検索が一時的に利用できない')).toBeVisible();
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

  test('7. 429 error displays rate limit message with retry button', async ({ page }) => {
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

    await page.waitForSelector('text=レート制限に達しました', { timeout: 5000 });

    await expect(page.locator('text=レート制限に達しました')).toBeVisible();
    await expect(page.locator('text=60秒後に再試行できます')).toBeVisible();
  });

  test('8. 500 error displays server error with retry button', async ({ page }) => {
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

    // Wait for icon to change from Copy to Check (with text-green-600 class)
    await page.waitForSelector('button[aria-label="回答をコピー"] svg.lucide-check.text-green-600', { timeout: 3000 });

    // Verify clipboard content (using stubbed clipboard API)
    const copiedText = await page.evaluate(() => (window as any).__lastCopiedText__);
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

  test('13. Search history suggestions display and allow editing before search', async ({ page }) => {
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
          const parsed = JSON.parse(history) as Array<{query: string; timestamp: number}>;
          return parsed.some(item => item.query === 'historical query');
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
    await expect.poll(async () =>
      page.evaluate(() => {
        const input = document.querySelector('[data-testid="agent-search-input"]');
        const active = document.activeElement === input;
        const suggestions = Array.from(
          document.querySelectorAll('[data-testid="search-history-suggestion"]')
        ).map(el => el.textContent?.trim());
        return active && suggestions.some(s => s?.includes('historical query'));
      }),
      { timeout: 10000 }
    ).toBeTruthy();

    // Verify suggestion dropdown container is visible
    const suggestionList = page.getByTestId('search-history-suggestions');
    await expect(suggestionList).toBeVisible();

    // Verify specific suggestion
    const suggestion = suggestionList.getByTestId('search-history-suggestion').filter({ hasText: 'historical query' });
    await expect(suggestion).toBeVisible();

    // NEW: Verify history click does NOT trigger immediate search
    let requestFired = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/rag/agent-search') && req.method() === 'POST') {
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
      (res) => res.url().includes('/api/rag/agent-search') && res.status() === 200,
      { timeout: 30000 }
    );

    await input.press('Enter');

    // Verify search was executed (extended timeout for progressive threshold fallback)
    await agentSearchResponse;

    // Verify results are displayed
    await expect(page.locator('[role="article"]')).toBeVisible();
  });

  test('14. Sample query chip prefills input and runs search', async ({ page }) => {
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

    // Category tiles are now always visible (no collapsible)
    // Click the infrastructure category tile which contains "AWS最新機能アップデート速報"
    const categoryTile = page.getByTestId('category-tile-infrastructure');
    await categoryTile.waitFor({ state: 'visible', timeout: 15000 });
    await categoryTile.click();

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await expect(input).toHaveValue('AWS最新機能アップデート速報');

    // Use specific selector for search button to avoid matching category tiles
    await page.getByTestId('agent-search-card').getByRole('button', { name: '検索' }).click();

    await expect(page.getByRole('heading', { name: 'AI回答' })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[role="article"]')).toContainText('テスト記事1');
  });

  test('15. Empty state guides users and links to regular search', async ({ page }) => {
    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_EMPTY_RESPONSE),
      })
    );

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('xyzabc123nonsense');
    // Use specific selector for search button to avoid matching category tiles
    await page.getByTestId('agent-search-card').getByRole('button', { name: '検索' }).click();

    await expect(page.getByText('該当する記事が見つかりませんでした')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('以下を試してみてください:')).toBeVisible();

    const searchLink = page.getByRole('link', { name: '通常検索を試す' });
    await expect(searchLink).toBeVisible();

    await searchLink.click();
    await expect(page).toHaveURL('/search');
  });

  test('16. Streaming indicator suppresses empty state during generation', async ({ page }) => {
    await page.addInitScript(() => {
      if ((window as any).__agentStreamingMockInstalled) {
        return;
      }
      (window as any).__agentStreamingMockInstalled = true;

      const encoder = new TextEncoder();

      const buildStream = () =>
        new ReadableStream({
          start(controller) {
            const enqueue = (payload: Record<string, unknown>) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            };

            enqueue({ type: 'text-delta', delta: 'Next.jsに関するストリーミング回答を生成中です。' });

            setTimeout(() => {
              enqueue({
                type: 'finish',
                usage: { totalTokens: 256, promptTokens: 128, completionTokens: 128 },
                cached: false,
                fallback: false,
              });
              controller.close();
            }, 800);
          },
        });

      let realFetch = window.fetch.bind(window);

      const streamingFetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
        if (url && url.includes('/api/rag/agent-search')) {
          return Promise.resolve(
            new Response(buildStream(), {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
              },
            })
          );
        }
        return realFetch(input as RequestInfo, init);
      };

      Object.defineProperty(window, 'fetch', {
        configurable: true,
        get() {
          return streamingFetch;
        },
        set(value) {
          realFetch = value.bind(window);
        },
      });
    });

    await page.goto('/search/agent');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('Next.js streaming guard');
    // Use specific selector for search button to avoid matching category tiles
    await page.getByTestId('agent-search-card').getByRole('button', { name: '検索' }).click();

    const streamingIndicator = page.getByTestId('streaming-indicator');
    await expect(streamingIndicator).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('該当する記事が見つかりませんでした')).not.toBeVisible();

    await expect(page.getByRole('heading', { name: 'AI回答' })).toBeVisible({ timeout: 15000 });
  });

  test.skip('17. Article links display and navigation', async ({ page }) => {
    // Mock API with article links
    const mockResponseWithArticles = {
      ...MOCK_SUCCESS_RESPONSE,
      response: `Reactに関する記事を3件見つけました:

1. React Server Components Guide (一致度: 92.0%)
   - サーバーコンポーネントの導入手順を解説
   - 公開日: 2025年10月20日 [#article-101]

2. React Performance Optimization (一致度: 88.0%)
   - レンダリング最適化テクニックを網羅
   - 公開日: 2025年10月18日 [#article-102]

3. React Hooks Complete Guide (一致度: 85.0%)
   - Hooks APIのベストプラクティスを整理
   - 公開日: 2025年10月15日 [#article-103]
`,
      toolCalls: [
        {
          id: '1',
          name: 'semantic-article-search',
          input: { query: 'React', topK: 3 },
          dynamic: false,
          output: {
            articles: [
              { articleId: '101', title: 'React Server Components Guide', similarity: 0.92, publishedAt: '2025-10-20T00:00:00Z' },
              { articleId: '102', title: 'React Performance Optimization', similarity: 0.88, publishedAt: '2025-10-18T00:00:00Z' },
              { articleId: '103', title: 'React Hooks Complete Guide', similarity: 0.85, publishedAt: '2025-10-15T00:00:00Z' },
            ],
            count: 3,
          },
        },
      ],
      articles: [
        { articleId: '101', title: 'React Server Components Guide', similarity: 0.92, publishedAt: '2025-10-20T00:00:00Z' },
        { articleId: '102', title: 'React Performance Optimization', similarity: 0.88, publishedAt: '2025-10-18T00:00:00Z' },
        { articleId: '103', title: 'React Hooks Complete Guide', similarity: 0.85, publishedAt: '2025-10-15T00:00:00Z' },
      ],
    };

    await page.route('**/api/rag/agent-search', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponseWithArticles),
      })
    );

    await page.goto('/search/agent');
    await page.waitForLoadState('networkidle');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('React performance optimization');
    await input.press('Enter');

    await page.waitForResponse(
      (res) => res.url().includes('/api/rag/agent-search') && res.status() === 200
    );

    await page.waitForSelector('[role="article"]', { timeout: 10000 });

    const articleLinks = page.getByTestId('agent-article-link');
    await expect(articleLinks).toHaveCount(3, { timeout: 10000 });

    const firstLink = articleLinks.first();
    await expect(firstLink).toHaveAttribute('target', '_blank');
    await expect(firstLink).toHaveAttribute('rel', 'noopener noreferrer');

    const [newPage] = await Promise.all([
      page.context().waitForEvent('page'),
      firstLink.click(),
    ]);
    await newPage.waitForLoadState('domcontentloaded');

    // Verify article detail page navigation
    expect(newPage.url()).toMatch(/\/articles\/101/);

    await newPage.close();
  });

  test.skip('18. Article links not displayed when no results', async ({ page }) => {
    // Mock API without article links
    const mockResponseWithoutArticles = {
      ...MOCK_SUCCESS_RESPONSE,
      toolCalls: [
        {
          id: '1',
          name: 'other-tool',
          input: {},
          dynamic: false,
        },
      ],
    };

    await page.route('**/api/rag/agent-search', async (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResponseWithoutArticles),
      });
    });

    await page.goto('/search/agent');
    await page.waitForLoadState('networkidle');

    const input = page.getByRole('textbox', { name: 'AI検索クエリ入力' });
    await input.fill('xyzabc123nonexistent');
    await input.press('Enter');

    await page.waitForResponse(
      (res) => res.url().includes('/api/rag/agent-search') && res.status() === 200
    );

    // Verify article links section is not displayed
    const articlesSection = page.locator('h2:has-text("参照記事")');
    await expect(articlesSection).not.toBeVisible();
  });
});
